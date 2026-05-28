import express from "express";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";
import { decryptRefreshToken } from "../auth/crypto.js";
import { refreshAccessToken } from "../auth/google.js";

export const youtubeRouter = express.Router();

// GET /api/youtube/subscriptions
youtubeRouter.get("/subscriptions", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;

    // look up refresh_token tied to currently logged in user
    const tokenResponse = await pool.query(
      `
      select refresh_token_ciphertext
      from oauth_tokens
      where user_id = $1
      `,
      [userId],
    );

    if (tokenResponse.rowCount === 0) {
      return res.status(400).json({ error: "No OAuth tokens stored for this user. Re-login." });
    }

    const refreshToken = decryptRefreshToken(
      tokenResponse.rows[0].refresh_token_ciphertext,
      env.TOKEN_ENCRYPTION_KEY,
    );

    // send in decrypted refresh token to get a fresh Google Access Token
    const { access_token } = await refreshAccessToken({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken,
    });

    // YouTube Data API: subscriptions.list
    const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");

    const ytResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!ytResponse.ok) {
      const text = await ytResponse.text();
      throw new Error(`YouTube API error: ${ytResponse.status} ${text}`);
    }

    const data:any = await ytResponse.json();

    // return a trimmed response
    const items = (data.items ?? []).map((it: any) => ({
      channelId: it.snippet?.resourceId?.channelId,
      title: it.snippet?.title,
      thumbnails: it.snippet?.thumbnails,
    }));

    res.json({ items });
  } catch (err) {
    next(err);
  }
});
