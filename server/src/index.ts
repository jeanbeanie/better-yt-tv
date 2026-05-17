import express from "express";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js"

const app = express();
app.use(express.json());

app.get("/api/test", (_req, res) => {
  res.json({ ok: true });
});

const port = env.PORT;

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

app.get("/api/db-test", async (_req, res, next) => {
  try {
    const result = await pool.query("select 1 as ok");
    res.json({ ok: result.rows[0].ok });
  } catch (err) {
    next(err);
  }
});
