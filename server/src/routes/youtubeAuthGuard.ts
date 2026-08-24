import type { NextFunction, Request, Response } from "express";
import type { AuthedRequest } from "../auth/requireAuth.js";
import { revokeSessionAndTokens } from "../auth/revoke.js";

// check if error is from Google refresh token expiration/revoke
function isInvalidGrantError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("invalid_grant");
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
