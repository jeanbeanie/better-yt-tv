import express from "express";
import { DatabaseError } from "pg";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";
import { isValidUuid } from "../lib/uuid.js";
import { applyRoundRobin, fetchListFeedRowsByList, FEED_PAGE_SIZE, type ListFeedRow } from "./feed.js";

export const listsRouter = express.Router();

const MAX_NAME_LENGTH = 100;
const SUMMARY_LIST_LIMIT = 6;
const SUMMARY_RESUME_LIMIT = 100;
const RESUME_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// shared by GET /:listId and PUT /:listId, loads a list scoped to the
// owning user plus its current channel membership, joined through
// user_subscriptions so a channel the user has since unsubscribed from
// silently drops out, returns null if the list doesn't exist or isn't
// owned by this user
async function fetchListDetail(userId: string, listId: string) {
  const listResult = await pool.query(
    `
    select id, name, created_at, updated_at
    from lists
    where id = $1 and user_id = $2
    `,
    [listId, userId],
  );

  if (listResult.rowCount === 0) {
    return null;
  }

  const listRow = listResult.rows[0];

  const channelsResult = await pool.query(
    `
    select us.channel_id, us.channel_title, us.channel_thumb_url
    from list_channels lc
    join lists l
      on l.id = lc.list_id
     and l.user_id = $1
    join user_subscriptions us
      on us.user_id = l.user_id
     and us.channel_id = lc.channel_id
    where lc.list_id = $2
    order by us.channel_title asc
    `,
    [userId, listId],
  );

  const channels = channelsResult.rows.map((row) => ({
    channelId: row.channel_id,
    title: row.channel_title,
    thumbUrl: row.channel_thumb_url,
  }));

  return {
    id: listRow.id,
    name: listRow.name,
    createdAt: listRow.created_at,
    updatedAt: listRow.updated_at,
    channelIds: channels.map((c) => c.channelId),
    channels,
  };
}

// GET /api/lists
// Return all lists for the current user, with a channel count for each
listsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;

    const result = await pool.query(
      `
      select
        l.id,
        l.name,
        l.created_at,
        l.updated_at,
        count(lc.channel_id) as channel_count
      from lists l
      left join list_channels lc
        on lc.list_id = l.id
      where l.user_id = $1
      group by l.id, l.name, l.created_at, l.updated_at
      order by l.created_at asc
      `,
      [userId],
    );

    return res.json({
      lists: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        channelCount: Number(row.channel_count),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// parses the comma joined listId:videoId pairs sent by the home page,
// malformed entries are skipped, the first SUMMARY_RESUME_LIMIT raw entries
// are considered, the last valid entry wins for a duplicate list id
function parseResumeHints(raw: unknown): Map<string, string> {
  const hints = new Map<string, string>();
  if (typeof raw !== "string") {
    return hints;
  }

  for (const entry of raw.split(",").slice(0, SUMMARY_RESUME_LIMIT)) {
    const parts = entry.split(":");
    if (parts.length !== 2) {
      continue;
    }

    const [listId, videoId] = parts;
    if (!isValidUuid(listId) || !RESUME_VIDEO_ID_RE.test(videoId)) {
      continue;
    }

    hints.set(listId.toLowerCase(), videoId);
  }

  return hints;
}

type ListCardVideo = {
  videoId: string;
  title: string;
  thumbUrl: string | null;
  kind: "resume" | "next";
};

function toListCardVideo(row: ListFeedRow, kind: "resume" | "next"): ListCardVideo {
  return {
    videoId: row.video_id,
    title: row.title,
    thumbUrl: row.thumb_url,
    kind,
  };
}

// first page of the queue, what ListsPage loads before FeedView restores a saved video
function pickFeaturedVideo(ordered: ListFeedRow[], savedVideoId: string | undefined): ListCardVideo | null {
  const firstPage = ordered.slice(0, FEED_PAGE_SIZE);
  const saved = savedVideoId ? firstPage.find((row) => row.video_id === savedVideoId) : undefined;
  if (saved) return toListCardVideo(saved, "resume");

  if (ordered.length === 0) return null;

  // first unwatched on that page, else the first item, same fallback as FeedView
  return toListCardVideo(firstPage.find((row) => !row.is_watched) ?? ordered[0], "next");
}

type SummaryCandidate = {
  id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
  ordered: ListFeedRow[];
  videoCount: number;
  unwatchedCount: number;
};

// unwatched first, then caught up, then no videos
function summaryTier(list: SummaryCandidate): number {
  if (list.unwatchedCount > 0) return 0;
  if (list.videoCount > 0) return 1;
  return 2;
}

// returns a sorted copy, equal entries keep the lists query order
function orderSummaryLists(lists: SummaryCandidate[]): SummaryCandidate[] {
  return [...lists].sort(
    (a, b) =>
      summaryTier(a) - summaryTier(b) ||
      b.unwatchedCount - a.unwatchedCount ||
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime() ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

// GET /api/lists/summary
// Top lists for the home page, with channels, queue counts and the featured video
// registered before /:listId, which would take "summary" as a list id
listsRouter.get("/summary", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const resumeHints = parseResumeHints(req.query.resume);

    const listsResult = await pool.query(
      `
      select id, name, created_at, updated_at
      from lists
      where user_id = $1
      order by created_at asc
      `,
      [userId],
    );

    if (listsResult.rowCount === 0) {
      return res.json({ lists: [] });
    }

    // every list needs its counts before the order is known
    const listIds: string[] = listsResult.rows.map((row) => row.id);
    const rowsByList = await fetchListFeedRowsByList(userId, listIds);

    const candidates: SummaryCandidate[] = listsResult.rows.map((row) => {
      const ordered = applyRoundRobin(rowsByList.get(row.id) ?? []);
      return {
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        updated_at: row.updated_at,
        ordered,
        videoCount: ordered.length,
        unwatchedCount: ordered.filter((r) => !r.is_watched).length,
      };
    });

    const kept = orderSummaryLists(candidates).slice(0, SUMMARY_LIST_LIMIT);

    // a channel with no subscription row drops out, same join as fetchListDetail
    const channelsResult = await pool.query(
      `
      select lc.list_id, us.channel_id, us.channel_title, us.channel_thumb_url
      from list_channels lc
      join lists l
        on l.id = lc.list_id
       and l.user_id = $1
      join user_subscriptions us
        on us.user_id = l.user_id
       and us.channel_id = lc.channel_id
      where lc.list_id = any($2::uuid[])
      order by us.channel_title asc
      `,
      [userId, kept.map((list) => list.id)],
    );

    const channelsByList = new Map<string, { channelId: string; title: string; thumbUrl: string | null }[]>();
    for (const row of channelsResult.rows) {
      const channel = {
        channelId: row.channel_id,
        title: row.channel_title,
        thumbUrl: row.channel_thumb_url,
      };
      const bucket = channelsByList.get(row.list_id);
      if (bucket) {
        bucket.push(channel);
      } else {
        channelsByList.set(row.list_id, [channel]);
      }
    }

    return res.json({
      lists: kept.map((list) => ({
        id: list.id,
        name: list.name,
        channels: channelsByList.get(list.id) ?? [],
        videoCount: list.videoCount,
        unwatchedCount: list.unwatchedCount,
        featuredVideo: pickFeaturedVideo(list.ordered, resumeHints.get(list.id)),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/lists
// Create a new empty list
listsRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;

    const { name } = req.body as { name?: string };
    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (!trimmedName) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
    }

    const result = await pool.query(
      `
      insert into lists (user_id, name)
      values ($1, $2)
      returning id, name, created_at, updated_at
      `,
      [userId, trimmedName],
    );

    const row = result.rows[0];

    return res.status(201).json({
      list: {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        channelIds: [],
      },
    });
  } catch (err) {
    if (err instanceof DatabaseError && err.code === "23505") {
      return res.status(409).json({ error: "You already have a list with this name." });
    }
    next(err);
  }
});

// GET /api/lists/:listId
// Load one list and its current channel membership, for the editor page
listsRouter.get("/:listId", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { listId } = req.params;

    // checked after requireAuth, not before: lists.id is a uuid column, and
    // an invalid value would otherwise throw a raw Postgres error (22P02)
    if (typeof listId !== "string" || !isValidUuid(listId)) {
      return res.status(404).json({ error: "List not found" });
    }

    const list = await fetchListDetail(userId, listId);

    if (!list) {
      return res.status(404).json({ error: "List not found" });
    }

    return res.json({ list });
  } catch (err) {
    next(err);
  }
});

// PUT /api/lists/:listId
// Save the full editor state in one request: rename the list and replace
// its channel membership
listsRouter.put("/:listId", requireAuth, async (req, res, next) => {
  const userId = (req as AuthedRequest).userId;
  const { listId } = req.params;

  // checked after requireAuth, not before: lists.id is a uuid column, and
  // an invalid value would otherwise throw a raw Postgres error (22P02)
  if (typeof listId !== "string" || !isValidUuid(listId)) {
    return res.status(404).json({ error: "List not found" });
  }

  const { name, channelIds } = req.body as { name?: string; channelIds?: unknown };
  const trimmedName = typeof name === "string" ? name.trim() : "";

  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }

  if (trimmedName.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
  }

  if (!Array.isArray(channelIds)) {
    return res.status(400).json({ error: "channelIds must be an array" });
  }

  // dedupe in memory before it ever reaches the DB
  const uniqueChannelIds = [...new Set(channelIds)];

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ownerResult = await client.query(
      `select id from lists where id = $1 and user_id = $2`,
      [listId, userId],
    );

    if (ownerResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "List not found" });
    }

    await client.query(
      `update lists set name = $1, updated_at = now() where id = $2`,
      [trimmedName, listId],
    );

    // silently drop any channelIds not present in this user's subscriptions
    const validChannelsResult = await client.query(
      `
      select channel_id
      from user_subscriptions
      where user_id = $1
        and channel_id = any($2::text[])
      `,
      [userId, uniqueChannelIds],
    );
    const validChannelIds = validChannelsResult.rows.map((row) => row.channel_id as string);

    await client.query(`delete from list_channels where list_id = $1`, [listId]);

    if (validChannelIds.length > 0) {
      await client.query(
        `
        insert into list_channels (list_id, channel_id)
        select $1, unnest($2::text[])
        on conflict do nothing
        `,
        [listId, validChannelIds],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof DatabaseError && err.code === "23505") {
      return res.status(409).json({ error: "You already have a list with this name." });
    }
    return next(err);
  } finally {
    client.release();
  }

  try {
    const list = await fetchListDetail(userId, listId);
    return res.json({ list });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/lists/:listId
// deletes a list, list_channels rows are removed automatically via the
// on delete cascade FK, no manual cleanup needed
listsRouter.delete("/:listId", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { listId } = req.params;

    // checked after requireAuth, not before: lists.id is a uuid column, and
    // an invalid value would otherwise throw a raw Postgres error (22P02)
    if (typeof listId !== "string" || !isValidUuid(listId)) {
      return res.status(404).json({ error: "List not found" });
    }

    const result = await pool.query(
      `delete from lists where id = $1 and user_id = $2 returning id`,
      [listId, userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "List not found" });
    }

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
