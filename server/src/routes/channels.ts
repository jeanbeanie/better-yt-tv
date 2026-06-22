import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";

export const channelsRouter = express.Router();

// GET /api/channels
// Return the current user's synced channels along with per channel preferences
channelsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;

    const result = await pool.query(
      `
      select
        us.channel_id,
        us.channel_title,
        us.channel_thumb_url,
        cp.enabled_all,
        cp.enabled_live,
        cp.excluded_shorts
      from user_subscriptions us
      join channel_preferences cp
        on cp.user_id = us.user_id
       and cp.channel_id = us.channel_id
      where us.user_id = $1
      order by us.channel_title asc
      `,
      [userId],
    );

    return res.json({
      channels: result.rows.map((row) => ({
        channelId: row.channel_id,
        title: row.channel_title,
        thumbUrl: row.channel_thumb_url,
        enabledAll: row.enabled_all,
        enabledLive: row.enabled_live,
        excludedShorts: row.excluded_shorts,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/channels/:channelId
// Update one or more preference flags for a single channel
channelsRouter.patch("/:channelId", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { channelId } = req.params;

    // all 3 values optional, client can send any combo of the 3
    const { enabledAll, enabledLive, excludedShorts } = req.body as {
      enabledAll?: boolean;
      enabledLive?: boolean;
      excludedShorts?: boolean;
    };

    if (!channelId) {
      return res.status(400).json({ error: "Missing channelId" });
    }

    // Build a partial update dynamically so the client can send only the field(s) it changed
    
    // updates will hold SQL fragments like enabled_all=$1
    const updates: string[] = [];
    // values will hold the actual values in matching order
    const values: unknown[] = [];
    // tracks which $N placeholder we're up to
    let paramIndex = 1;

    // ensure params to be updated is intentional booleans 
    // rather than simply undefined from client
    if (typeof enabledAll === "boolean") {
      updates.push(`enabled_all = $${paramIndex}`);
      values.push(enabledAll);
      paramIndex += 1;
    }

    if (typeof enabledLive === "boolean") {
      updates.push(`enabled_live = $${paramIndex}`);
      values.push(enabledLive);
      paramIndex += 1;
    }

    if (typeof excludedShorts === "boolean") {
      updates.push(`excluded_shorts = $${paramIndex}`);
      values.push(excludedShorts);
      paramIndex += 1;
    }

    // If no valid fields were provided, reject the request
    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    // Add updated_at plus the WHERE params
    updates.push(`updated_at = now()`);
    values.push(userId, channelId);

    const result = await pool.query(
      `
      update channel_preferences
      set ${updates.join(", ")}
      where user_id = $${paramIndex}
        and channel_id = $${paramIndex + 1}
      returning
        user_id,
        channel_id,
        enabled_all,
        enabled_live,
        excluded_shorts,
        updated_at
      `,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Channel preferences not found" });
    }

    const row = result.rows[0];

    return res.json({
      channel: {
        channelId: row.channel_id,
        enabledAll: row.enabled_all,
        enabledLive: row.enabled_live,
        excludedShorts: row.excluded_shorts,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});
