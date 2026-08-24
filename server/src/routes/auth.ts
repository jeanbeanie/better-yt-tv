import type { Request, Response } from "express";
import express from "express";
import { env } from "../config/env.js";
import {
  exchangeCodeForTokens,
  getGoogleUserFromIdToken,
  buildGoogleAuthUrl,
  revokeGoogleToken,
} from "../auth/google.js";
import { encryptRefreshToken, decryptRefreshToken } from "../auth/crypto.js";
import { revokeSessionAndTokens } from "../auth/revoke.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";
import { pool } from "../db/pool.js";
import { validateInviteCode, consumeInviteCode } from "../invites/invites.js";
import crypto from "node:crypto";

export const authRouter = express.Router();

// GET /api/auth/login
authRouter.get("/login", async (req: Request, res: Response) => {
  // checked before redirecting, since an oauth slot burns the moment
  // someone consents at Google, not whenever we decide to reject them after
  const inviteCode = typeof req.query.invite === "string" ? req.query.invite : null;
  if (!inviteCode || !(await validateInviteCode(inviteCode))) {
    return res.status(403).json({ error: "An invite is required to sign in" });
  }

  // Generate a random state to protect against CSRF
  const state = crypto.randomUUID();
  // Store it in an httpOnly cookie so we can validate on callback
  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: env.cookieSameSite,
    secure: env.isSecureContext,
    maxAge: 10 * 60 * 1000, // 10 minutes
    path:"/",
  });

  // Carry the invite code to callback, where we'll know whether this is a
  // returning user (no invite needed) or a new one (invite gets consumed)
  res.cookie("invite_code", inviteCode, {
    httpOnly: true,
    sameSite: env.cookieSameSite,
    secure: env.isSecureContext,
    maxAge: 10 * 60 * 1000, // 10 minutes
    path:"/",
  });

  const authUrl = buildGoogleAuthUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: env.OAUTH_CALLBACK_URL,
    state,
    scope: [
      // Read-only YouTube scopes (good for subscriptions + video metadata)
      "https://www.googleapis.com/auth/youtube.readonly",
      // Useful to reliably get identity info
      "openid",
      "email",
      "profile",
    ],
  });

  res.redirect(authUrl);
});


// POST /api/auth/logout
authRouter.post("/logout", async (req: Request, res: Response, next) => {

  try {
    const sid = req.cookies?.sid;

    // always clear cookie (missing or not) so browser state resets
    res.clearCookie("sid", {
      path:"/",
    });

    if(!sid) return res.json({ ok:true });

    // find who this session belongs to, so the local refresh token can be
    // deleted alongside revoking the session itself
    const sessionResult = await pool.query(
      `select user_id from sessions where id = $1`,
      [sid],
    );
    const userId = sessionResult.rows[0]?.user_id as string | undefined;

    if (userId) {
      await revokeSessionAndTokens(userId, sid);
    }

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


// GET /api/auth/callback
authRouter.get("/callback", async (req: Request, res: Response, next) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).json({ error: String(error) });
    }
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing code" });
    }
    if (!state || typeof state !== "string") {
      return res.status(400).json({ error: "Missing state" });
    }

    const cookieState = req.cookies?.oauth_state;
    if (!cookieState || cookieState !== state) {
      return res.status(400).json({ error: "Invalid oauth state" });
    }

    // Exchange auth code -> tokens
    const tokens = await exchangeCodeForTokens({
      code,
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.OAUTH_CALLBACK_URL,
    });

    if (!tokens.id_token) {
      return res.status(400).json({ error: "Missing id_token from Google" });
    }

    const googleUser = await getGoogleUserFromIdToken(tokens.id_token);
    // googleUser.sub is what you'll store as users.google_sub
    const googleSub = googleUser.sub;
    const email = googleUser.email ?? null;

    const existingUserRes = await pool.query(`select id from users where google_sub = $1`, [
      googleSub,
    ]);

    let userId: string;

    if (existingUserRes.rowCount) {
      // returning user, no invite needed
      userId = existingUserRes.rows[0].id;
      await pool.query(`update users set email = $1 where id = $2`, [email, userId]);
    } else {
      // new signup, requires a valid invite consumed in the same transaction
      const inviteCode = req.cookies?.invite_code as string | undefined;
      if (!inviteCode) {
        return res.status(403).json({ error: "An invite is required to sign in" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const userRes = await client.query(
          `insert into users (google_sub, email) values ($1, $2) returning id`,
          [googleSub, email],
        );
        userId = userRes.rows[0].id;

        const consumed = await consumeInviteCode(inviteCode, userId, client);
        if (!consumed) {
          await client.query("ROLLBACK");
          return res.status(403).json({ error: "Invalid or already used invite code" });
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    // Store refresh token if provided (Google may not always return it unless prompt=consent)
    if (tokens.refresh_token) {
      const encrypted = encryptRefreshToken(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY);

      await pool.query(
        `
        insert into oauth_tokens (user_id, refresh_token_ciphertext, access_token, expires_at, scopes, updated_at)
        values ($1, $2, $3, $4, $5, now())
        on conflict (user_id) do update
          set refresh_token_ciphertext = excluded.refresh_token_ciphertext,
              access_token = excluded.access_token,
              expires_at = excluded.expires_at,
              scopes = excluded.scopes,
              updated_at = now()
        `,
        [
          userId,
          encrypted,
          tokens.access_token ?? null,
          tokens.expires_at ? new Date(tokens.expires_at) : null,
          tokens.scope ?? null,
        ],
      );
    }

    // Revoke any existing active sessions for this user (so for now: 1 active session)
    await pool.query(
      `
      update sessions
      set revoked_at = now()
      where user_id = $1
        and revoked_at is null
        and expires_at > now()
      `,
      [userId],
    );

    // Create a session and set sid cookie
    const sessionTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const expiresAt = new Date(Date.now() + sessionTtlMs);

    const sessionRes = await pool.query(
      `
      insert into sessions (user_id, expires_at)
      values ($1, $2)
      returning id
      `,
      [userId, expiresAt],
    );

    const sid: string = sessionRes.rows[0].id;

    res.cookie("sid", sid, {
      httpOnly: true,
      sameSite: env.cookieSameSite,
      secure: env.isSecureContext,
      maxAge: sessionTtlMs,
      path: "/",
    });

    // Clear state cookie
    res.clearCookie("oauth_state");
    res.clearCookie("invite_code");

    // For now: redirect back to client
    // Later we’ll set a real session cookie and redirect with no JSON.
    res.redirect(env.CLIENT_ORIGIN);
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/whoami
authRouter.get("/whoami", async (req: Request, res: Response, next) => {
  try {
    const sid = req.cookies?.sid;
    if (!sid) return res.json({ user: null });

    const r = await pool.query(
      `
      select
        u.id,
        u.email,
        u.google_sub,
        u.is_admin,
        s.expires_at
      from sessions s
      join users u on u.id = s.user_id
      where s.id = $1
        and s.revoked_at is null
        and s.expires_at > now()
      `,
      [sid],
    );

    if (r.rowCount === 0) return res.json({ user: null });

    return res.json({ user: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/account
// revokes the stored Google refresh token, then deletes the user row, which
// cascades to every other table referencing it
authRouter.delete("/account", requireAuth, async (req: Request, res: Response, next) => {
  try {
    const userId = (req as AuthedRequest).userId;

    const tokenResult = await pool.query(
      `select refresh_token_ciphertext from oauth_tokens where user_id = $1`,
      [userId],
    );
    const ciphertext = tokenResult.rows[0]?.refresh_token_ciphertext as string | undefined;

    if (ciphertext) {
      try {
        const refreshToken = decryptRefreshToken(ciphertext, env.TOKEN_ENCRYPTION_KEY);
        await revokeGoogleToken(refreshToken);
      } catch (err) {
        console.error("Failed to revoke Google token during account deletion:", err);
      }
    }

    await pool.query(`delete from users where id = $1`, [userId]);

    res.clearCookie("sid", { path: "/" });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

