import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";

export const feedRouter = express.Router();

// GET /api/feed/all
feedRouter.get("/all", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;

    // read users saved subs for now, TODO return videos instead
    const result = await pool.query(
      `
      select channel_id, channel_title
      from user_subscriptions
      where user_id = $1
      order by channel_title asc
      `,
      [userId],
    );

    return res.json({
      items: result.rows,
    });
  } catch (err) {
    next(err);
  }
})
