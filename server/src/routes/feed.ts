import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";
import { isValidUuid } from "../lib/uuid.js";

export const feedRouter = express.Router();

// input must already be sorted published_at desc, that ordering is what
// makes the channel grouping below come out with the most recently active
// channel first, for free, without a separate sort
export function applyRoundRobin<T extends { channel_id: string }>(rows: T[]): T[] {
  const channelQueues = new Map<string, T[]>();

  for (const row of rows) {
    if (!channelQueues.has(row.channel_id)) {
      channelQueues.set(row.channel_id, []);
    }
    channelQueues.get(row.channel_id)!.push(row);
  }

  const result: T[] = [];
  for (let i = 0; result.length < rows.length; i++) {
    for (const queue of channelQueues.values()) {
      if (i < queue.length) result.push(queue[i]);
    }
  }
  return result;
}

// Reject a malformed listId before it ever reaches a query, same fix as
// listsRouter.param("listId", ...) in routes/lists.ts, needed separately
// here since Express param hooks are per-router, not global
feedRouter.param("listId", (req, res, next, value) => {
  if (!isValidUuid(value)) {
    return res.status(404).json({ error: "List not found" });
  }
  next();
});

// Shared by GET /all and GET /live, both return recent cached videos for
// channels this user is subscribed to, filtered by a single per-channel
// boolean preference (enabled_all or enabled_live) plus excluded_shorts
// preferenceColumn is interpolated directly (not a $N placeholder, since
// placeholders are for values, not identifiers) since it's a
// TypeScript union restricted to two literal, code-controlled values,
// never user input, same trust model as the dynamic column names already
// built in channels.ts's partial-update queries
//
// Extracted here rather than duplicated per route because this exact query
// shape has already produced one real bug from copy-paste drift, the
// coalesce()/fail-open handling below was missing from the original /all
// query until an orphaned channel_preferences row surfaced it, one copy
// means that fix (and any future one) only has to happen once
async function fetchFeedForPreference(
  userId: string,
  preferenceColumn: "enabled_all" | "enabled_live",
) {
  return pool.query(
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
    left join channel_preferences cp
      on cp.user_id = us.user_id
     and cp.channel_id = us.channel_id
    join videos_cache v
      on v.channel_id = us.channel_id
    left join user_video_state uvs
      on uvs.user_id = us.user_id
     and uvs.video_id = v.video_id
    where us.user_id = $1
      -- If preferences are missing entirely (see TODO in youtube.ts sync
      -- flow), fail open rather than silently excluding the channel
      and coalesce(cp.${preferenceColumn}, true) = true
      and (
        -- If Shorts are allowed for this channel (or preferences are
        -- missing, same fail-open reasoning as above), include all
        coalesce(cp.excluded_shorts, false) = false

        -- If duration is unknown, keep the video for now rather than
        -- risk hiding a normal upload before metadata hydration completes
        or v.duration_seconds is null

        -- If duration is known and greater than 60 seconds,
        -- treat it as NOT a short, and include it
        or v.duration_seconds > 60
      )
    order by v.published_at desc
    limit 200
    `,
    [userId],
  );
}

// GET /api/feed/all
// Return recent cached videos for channels this user is subscribed to
// Apply per-channel user preferences : enabled_all, excluded_shorts
feedRouter.get("/all", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const result = await fetchFeedForPreference(userId, "enabled_all");

    return res.json({
      items: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/feed/live
// Return recent cached videos for channels the user has flagged with
// "Enable in Live" in channel settings. Same shape as /all, just filtered
// by enabled_live instead of enabled_all.
feedRouter.get("/live", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const result = await fetchFeedForPreference(userId, "enabled_live");

    return res.json({
      items: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/feed/lists/:listId
// Return recent cached videos for channels in a specific list.
// Ignores channel_preferences.enabled_all (a channel can be off in the All
// feed but still deliberately in a list) but still respects excluded_shorts,
// and reuses watched state, same as /all.
feedRouter.get("/lists/:listId", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { listId } = req.params;

    const listResult = await pool.query(
      `select id, name from lists where id = $1 and user_id = $2`,
      [listId, userId],
    );

    if (listResult.rowCount === 0) {
      return res.status(404).json({ error: "List not found" });
    }

    // Join list_channels -> user_subscriptions (not straight to videos_cache)
    // so a channel the user has since unsubscribed from silently drops out,
    // same mechanism as fetchListDetail() in lists.ts
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
      from list_channels lc
      join lists l
        on l.id = lc.list_id
       and l.user_id = $1
      join user_subscriptions us
        on us.user_id = l.user_id
       and us.channel_id = lc.channel_id
      left join channel_preferences cp
        on cp.user_id = us.user_id
       and cp.channel_id = us.channel_id
      join videos_cache v
        on v.channel_id = lc.channel_id
      left join user_video_state uvs
        on uvs.user_id = l.user_id
       and uvs.video_id = v.video_id
      where lc.list_id = $2
        and (
          -- If Shorts are allowed for this channel (or preferences are
          -- missing entirely, fail open rather than silently excluding),
          -- include all videos, enabled_all is deliberately never
          -- referenced here, list feeds ignore it by design
          coalesce(cp.excluded_shorts, false) = false

          -- If duration is unknown, keep the video for now rather than
          -- risk hiding a normal upload before metadata hydration completes
          or v.duration_seconds is null

          -- If duration is known and greater than 60 seconds,
          -- treat it as NOT a short, and include it
          or v.duration_seconds > 60
        )
      order by v.published_at desc
      limit 200
      `,
      [userId, listId],
    );

    return res.json({
      list: {
        id: listResult.rows[0].id,
        name: listResult.rows[0].name,
      },
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
