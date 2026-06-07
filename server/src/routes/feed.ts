import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";

export const feedRouter = express.Router();

// GET /api/feed/all
// Return recent cached videos for channels this user is subscribed to
feedRouter.get("/all", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;

    // Join user_subscriptions with videos_cache so we only return
    // videos from channels the current user follows
    const result = await pool.query(
      `
      select
        v.video_id,
        v.channel_id,
        us.channel_title,
        v.title,
        v.published_at,
        v.thumb_url
      from user_subscriptions us
      join videos_cache v
        on v.channel_id = us.channel_id
      where us.user_id = $1
      order by v.published_at desc
      limit 200
      `,
      [userId],
    );

    return res.json({
      items: result.rows,
    });
  } catch (err) {
    next(err);
  }
});
