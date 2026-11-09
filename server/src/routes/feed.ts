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

// reads offset/limit from the query string, malformed or out of range
// values fall back to safe defaults instead of reaching the query
function parsePagination(query: express.Request["query"]) {
  const rawOffset = Number(query.offset);
  const rawLimit = Number(query.limit);

  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50;

  return { offset, limit: Math.min(limit, 200) };
}

// Used by GET /all, filtered by the enabled_all preference plus excluded_shorts.
// preferenceColumn is interpolated directly (not a $N placeholder) since
// it's a code controlled literal, never user input
async function fetchFeedForPreference(
  userId: string,
  preferenceColumn: "enabled_all",
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
      -- Fail open if preferences are missing (see docblock above)
      and coalesce(cp.${preferenceColumn}, true) = true
      -- upcoming streams cannot be played yet, they show on /live
      and coalesce(v.live_broadcast_content, 'none') <> 'upcoming'
      and (
        -- Same fail-open reasoning as above for Shorts exclusion
        coalesce(cp.excluded_shorts, false) = false

        -- If duration is unknown, keep the video for now rather than
        -- risk hiding a normal upload before metadata hydration completes
        or v.duration_seconds is null

        -- If duration is known and greater than 60 seconds,
        -- treat it as NOT a short, and include it
        or v.duration_seconds > 60
      )
    order by v.published_at desc
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
    const { offset, limit } = parsePagination(req.query);
    const result = await fetchFeedForPreference(userId, "enabled_all");

    const ordered = applyRoundRobin(result.rows);
    const items = ordered.slice(offset, offset + limit);
    const hasMore = offset + limit < ordered.length;

    return res.json({ items, hasMore });
  } catch (err) {
    next(err);
  }
});

// upcoming window relative to now, a delayed start stays visible for 2
// hours, schedules further out than 7 days are hidden
const UPCOMING_PAST_WINDOW_MS = 2 * 60 * 60 * 1000;
const UPCOMING_FUTURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type LiveRow = {
  video_id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  thumb_url: string | null;
  live_broadcast_content: string;
  scheduled_start_time: Date | string | null;
  actual_start_time: Date | string | null;
};

// pg returns Date objects, tests may pass strings
function toMs(value: Date | string | null): number | null {
  return value === null ? null : new Date(value).getTime();
}

// GET /api/feed/live
// Return live and upcoming streams for channels with "Enable in Live" on
// in channel settings, split into two lists
// live: actual start desc, unknown start last
// upcoming: scheduled start asc, inside the upcoming window only
feedRouter.get("/live", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const result = await pool.query<LiveRow>(
      `
      select
        v.video_id,
        v.channel_id,
        us.channel_title,
        v.title,
        v.thumb_url,
        v.live_broadcast_content,
        v.scheduled_start_time,
        v.actual_start_time
      from user_subscriptions us
      left join channel_preferences cp
        on cp.user_id = us.user_id
       and cp.channel_id = us.channel_id
      join videos_cache v
        on v.channel_id = us.channel_id
      where us.user_id = $1
        -- a missing preference row counts as enabled
        and coalesce(cp.enabled_live, true) = true
        and v.live_broadcast_content in ('live', 'upcoming')
      `,
      [userId],
    );

    const now = Date.now();
    const pastCutoff = now - UPCOMING_PAST_WINDOW_MS;
    const futureCutoff = now + UPCOMING_FUTURE_WINDOW_MS;

    const liveRows = result.rows.filter((r) => r.live_broadcast_content === "live");
    liveRows.sort((a, b) => {
      const at = toMs(a.actual_start_time);
      const bt = toMs(b.actual_start_time);
      if (at === null) return bt === null ? 0 : 1;
      if (bt === null) return -1;
      return bt - at;
    });

    const upcomingRows = result.rows.filter((r) => {
      if (r.live_broadcast_content !== "upcoming") return false;
      const ms = toMs(r.scheduled_start_time);
      return ms !== null && ms >= pastCutoff && ms <= futureCutoff;
    });
    upcomingRows.sort(
      (a, b) => (toMs(a.scheduled_start_time) ?? 0) - (toMs(b.scheduled_start_time) ?? 0),
    );

    const toItem = (r: LiveRow) => ({
      video_id: r.video_id,
      channel_id: r.channel_id,
      channel_title: r.channel_title,
      title: r.title,
      thumb_url: r.thumb_url,
      scheduled_start_time: r.scheduled_start_time,
      actual_start_time: r.actual_start_time,
    });

    return res.json({ live: liveRows.map(toItem), upcoming: upcomingRows.map(toItem) });
  } catch (err) {
    next(err);
  }
});

// GET /api/feed/lists/:listId
// Return recent cached videos for channels in a specific list, ignoring
// channel_preferences.enabled_all (a channel can be off in the All feed
// but still deliberately in a list) but still respecting excluded_shorts,
// and reusing watched state, same as /all
feedRouter.get("/lists/:listId", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { listId } = req.params;
    const { offset, limit } = parsePagination(req.query);

    // checked after requireAuth, not before: lists.id is a uuid column, and
    // an invalid value would otherwise throw a raw Postgres error (22P02)
    if (typeof listId !== "string" || !isValidUuid(listId)) {
      return res.status(404).json({ error: "List not found" });
    }

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
        -- same upcoming stream exclusion as GET /all
        and coalesce(v.live_broadcast_content, 'none') <> 'upcoming'
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
      `,
      [userId, listId],
    );

    const ordered = applyRoundRobin(result.rows);
    const items = ordered.slice(offset, offset + limit);
    const hasMore = offset + limit < ordered.length;

    return res.json({
      list: {
        id: listResult.rows[0].id,
        name: listResult.rows[0].name,
      },
      items,
      hasMore,
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
