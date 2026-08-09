import type { NextFunction, Request, Response } from "express";
import type { AuthedRequest } from "../auth/requireAuth.js";
import { pool } from "../db/pool.js";

// check if error is from Google refresh token expiration/revoke
function isInvalidGrantError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("invalid_grant");
}

// delete invalid Google OAuth token and set session (if included) as revoked in db
// Wrapped in a transaction so a failure partway through can't leave the token
// deleted without the session actually being revoked (or vice versa).
async function revokeSessionAndTokens(userId: string, sid?: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      delete from oauth_tokens
      where user_id = $1
      `,
      [userId],
    );

    if (sid) {
      await client.query(
        `
        update sessions
        set revoked_at = now()
        where id = $1
        `,
        [sid],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// TS type for async Express route handler
type AuthedHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;


// middleware wrapper for youtube route handlers
// converts Google invalid_grant into a clean 401 re-auth response
// and handles local session/token cleanup 
export function withYoutubeReauthHandling(handler: AuthedHandler): AuthedHandler {
  return async (req, res, next) => {
    try { // try running the handler normally
      await handler(req, res, next);
    } catch (err) {
      // if error, and not invalid_grant then handle the err as usual
      if (!isInvalidGrantError(err)) {
        return next(err);
      }

      const userId = (req as AuthedRequest).userId;
      const sid = req.cookies?.sid as string | undefined;

      // run token/session cleanup logic if the error is invalid_grant
      try {
        await revokeSessionAndTokens(userId, sid);
      } catch (cleanupErr) {
        console.error("Failed cleanup after invalid_grant:", cleanupErr);
      }

      res.clearCookie("sid", { path: "/" });
      return res.status(401).json({
        code: "YOUTUBE_REAUTH_REQUIRED",
        message: "Your YouTube connection expired. Please sign in again.",
      });
    }
  };
}
