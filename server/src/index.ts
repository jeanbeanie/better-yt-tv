import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { authRouter } from "./routes/auth.js";
import { youtubeRouter } from "./routes/youtube.js";
import { feedRouter } from "./routes/feed.js";
import { channelsRouter } from "./routes/channels.js";
import { listsRouter } from "./routes/lists.js";

const app = express();

// must run CORS before routes
// origin cannot be "*" when credentials:true
// credentials: true is required for cookies over fetch()
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }),
);

// handle preflight
app.options(/.*/, cors({ origin: env.CLIENT_ORIGIN, credentials: true }));

app.use(express.json());
app.use(cookieParser());

app.get("/api/test", (_req, res) => {
  res.json({ ok: true });
});

// db test
app.get("/api/db-test", async (_req, res, next) => {
  try {
    const result = await pool.query("select 1 as ok");
    res.json({ ok: result.rows[0].ok });
  } catch (err) {
    next(err);
  }
});

// Mount other routes:
 
// - GET /api/auth/login
// - POST /api/auth/logout
// - GET /api/auth/callback
app.use("/api/auth", authRouter);

// - GET /api/youtube/subscriptions
// - POST /api/youtube/sync-subscriptions
app.use("/api/youtube", youtubeRouter);

// - GET /api/feed/all
app.use("/api/feed", feedRouter);

// - GET /api/channels
// - PATCH /api/channels/:channelId
app.use("/api/channels", channelsRouter);

// - GET /api/lists
// - POST /api/lists
// - GET /api/lists/:listId
app.use("/api/lists", listsRouter);

// error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

const port = env.PORT;

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

