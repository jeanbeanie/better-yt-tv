import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { youtubeRouter } from "./routes/youtube.js";
import { feedRouter } from "./routes/feed.js";
import { channelsRouter } from "./routes/channels.js";
import { listsRouter } from "./routes/lists.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultClientDistPath = path.resolve(__dirname, "../../client/dist");

// configurable so tests can use a temp dir instead of a real Vite build
export function createApp(clientDistPath: string = defaultClientDistPath) {
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

  // liveness only, no db check. railway gates deploys on this endpoint, so
  // a database hiccup can't fail a deploy that's otherwise fine
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
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
  // - GET /api/feed/live
  // - GET /api/feed/lists/:listId
  app.use("/api/feed", feedRouter);

  // - GET /api/channels
  // - PATCH /api/channels/:channelId
  app.use("/api/channels", channelsRouter);

  // - GET /api/lists
  // - POST /api/lists
  // - GET /api/lists/:listId
  // - PUT /api/lists/:listId
  // - DELETE /api/lists/:listId
  app.use("/api/lists", listsRouter);

  // unmatched /api paths are real 404s, not frontend routes
  // must come before static and the fallback below so they cant swallow it
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // index false since index.html is served explicitly below with its own
  // cache headers. vite hashes asset filenames so those can cache long
  app.use(
    express.static(clientDistPath, {
      index: false,
      maxAge: "1y",
      immutable: true,
    }),
  );

  // spa fallback, serves index.html for any remaining GET so react router
  // can take over in the browser. without this /all or /settings/channels
  // would 404 on the server on a direct load or refresh
  app.get(/.*/, (_req, res, next) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
      if (err) next(err);
    });
  });

  // error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
}
