import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";

export const listsRouter = express.Router();

const MAX_NAME_LENGTH = 100;

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
