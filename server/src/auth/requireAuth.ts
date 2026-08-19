import type { Request, Response, NextFunction } from "express";
import { pool } from "../db/pool.js";


// extend standard Express Request to include userId
export type AuthedRequest = Request & {
  userId: string;
  sessionId: string;
  isAdmin: boolean;
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
// Middleware to check if a user is securely logged in 
// before allowing them access to a specific route

  try {
    // look for session id cookie sent by user's browser
    const sid = req.cookies?.sid as string | undefined;

    // no session found, user isn't logged into site
    if (!sid) {
      return res.status(401).json({ 
        code: "AUTH_REQUIRED",
        message: "You must be signed in to continue.", 
      });
    }

    // if session id, find matching session in sessions table (joined to
    // users so is_admin comes back in the same round trip), and make sure
    // it is not a revoked or expired session
    //
    // this is an inner join: a session whose users row no longer exists
    // now fails this lookup entirely and gets treated as invalid, rather
    // than resolving a userId with no backing user
    const result = await pool.query(
      `
      select s.user_id, u.is_admin
      from sessions s
      join users u on u.id = s.user_id
      where s.id = $1
        and s.revoked_at is null
        and s.expires_at > now()
      `,
      [sid],
    );

    // session id not found in table, or expired/revoked
    if (result.rowCount === 0) {
      // clear stale/invalid session from browser
      res.clearCookie("sid", { path: "/" });
      return res.status(401).json({
        code: "AUTH_REQUIRED",
        message: "Your session is no longer valid. Please sign in again.",
      });
    }

    // attach user_id from tablen and session to request object before proceeding to actual route handler
    (req as AuthedRequest).userId = result.rows[0].user_id as string;
    (req as AuthedRequest).sessionId = sid;
    (req as AuthedRequest).isAdmin = result.rows[0].is_admin as boolean;
    return next();
  } catch (err) {
    return next(err);
  }
}
