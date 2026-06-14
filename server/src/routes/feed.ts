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
    // calc user's is_watched state per video
    const result = await pool.query(
       `
      select
        v.video_id,
        v.channel_id,
        us.channel_title,
        v.title,
        v.published_at,
        v.thumb_url,
        uvs.watched_at,
        (uvs.watched_at is not null) as is_watched
      from user_subscriptions us
      join videos_cache v
        on v.channel_id = us.channel_id
      left join user_video_state uvs
        on uvs.user_id = us.user_id
       and uvs.video_id = v.video_id
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

// POST /api/feed/videos/:videoId/watch
// Mark a video as watched for the current user
feedRouter.post("/videos/:videoId/watch", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { videoId } = req.params;

    if (!videoId) {
      return res.status(400).json({ error: "Missing videoId" });
    }

    // Upsert watched state so repeated clicks are harmless
    await pool.query(
      `
      insert into user_video_state (
        user_id,
        video_id,
        watched_at,
        source,
        updated_at
      )
      values ($1, $2, now(), 'manual', now())
      on conflict (user_id, video_id) do update
        set watched_at = now(),
            source = 'manual',
            updated_at = now()
      `,
      [userId, videoId],
    );

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/feed/videos/:videoId/unwatch
// Mark a video as not watched for the current user
feedRouter.post("/videos/:videoId/unwatch", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { videoId } = req.params;

    if (!videoId) {
      return res.status(400).json({ error: "Missing videoId" });
    }

    // Keep the row but clear watched_at to preserve per-user state history shape
    await pool.query(
      `
      insert into user_video_state (
        user_id,
        video_id,
        watched_at,
        source,
        updated_at
      )
      values ($1, $2, null, 'reset', now())
      on conflict (user_id, video_id) do update
        set watched_at = null,
            source = 'reset',
            updated_at = now()
      `,
      [userId, videoId],
    );

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
