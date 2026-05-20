import type { Request, Response } from "express";
import express from "express";
import { env } from "../config/env.js";
import { exchangeCodeForTokens, getGoogleUserFromIdToken, buildGoogleAuthUrl } from "../auth/google.js";
import { encryptRefreshToken } from "../auth/crypto.js";
import { pool } from "../db/pool.js";

export const authRouter = express.Router();

// GET /api/auth/login
authRouter.get("/login", async (req: Request, res: Response) => {
  // Generate a random state to protect against CSRF
  const state = crypto.randomUUID();
  // Store it in an httpOnly cookie so we can validate on callback
  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // set true when behind https
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

    const googleUser = getGoogleUserFromIdToken(tokens.id_token);
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

    // Clear state cookie
    res.clearCookie("oauth_state");

    // For now: redirect back to client
    // Later we’ll set a real session cookie and redirect with no JSON.
    res.redirect(env.CLIENT_ORIGIN);
  } catch (err) {
    next(err);
  }
});
