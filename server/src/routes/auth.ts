import type { Request, Response } from "express";
import express from "express";
import { env } from "../config/env.js";
import { exchangeCodeForTokens, getGoogleUserFromIdToken, buildGoogleAuthUrl } from "../auth/google.js";
import { encryptRefreshToken } from "../auth/crypto.js";
import { pool } from "../db/pool.js";
import crypto from "node:crypto";

export const authRouter = express.Router();

// GET /api/auth/login
authRouter.get("/login", async (req: Request, res: Response) => {
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
    
    // update session row's revoked_at to now()
    await pool.query(
      `
      update sessions
      set revoked_at = now()
      where id = $1
      `,
      [sid],
    );

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

    // Upsert user
    const userRes = await pool.query(
      `
      insert into users (google_sub, email)
      values ($1, $2)
      on conflict (google_sub) do update
        set email = excluded.email
      returning id
      `,
      [googleSub, email],
    );
    const userId: string = userRes.rows[0].id;

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

