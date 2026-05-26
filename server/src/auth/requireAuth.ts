import type { Request, Response, NextFunction } from "express";
import { pool } from "../db/pool.js";


// extend standard Express Request to include userId
export type AuthedRequest = Request & { userId: string };

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
// Middleware to check if a user is securely logged in 
// before allowing them access to a specific route

  try {
    // look for session id cookie sent by user's browser
    const sid = req.cookies?.sid;
    if (!sid) return res.status(401).json({ error: "Not authenticated" });

    // find matching session id in sessions table,
    // make sure it is not a revoked or expired session
    const r = await pool.query(
      `
      select user_id
      from sessions
      where id = $1
        and revoked_at is null
        and expires_at > now()
      `,
      [sid],
    );

    if (r.rowCount === 0) return res.status(401).json({ error: "Not authenticated" });

    // attach user_id from table to request object before proceeding to actual route handler
    (req as AuthedRequest).userId = r.rows[0].user_id;
    next();
  } catch (err) {
    next(err);
  }
}
