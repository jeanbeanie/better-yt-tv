import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";

export const listsRouter = express.Router();

const MAX_NAME_LENGTH = 100;

// Shared by GET /:listId and PUT /:listId: load a list (scoped to the owning
// user) plus its current channel membership, joined through
// user_subscriptions so channels the user has since unsubscribed from
// silently drop out of the result. Returns null if the list doesn't exist
// or isn't owned by this user.
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
  } catch (err: any) {
    if (err?.code === "23505") {
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
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err?.code === "23505") {
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
