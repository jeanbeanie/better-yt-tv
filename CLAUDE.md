# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal YouTube viewing dashboard: watch the most recent uploads from only the channels you're subscribed to, like a TV queue for your subscriptions.

- **Frontend**: Vite + React SPA, with a custom `Player` component built around the YouTube IFrame API for playback, watched state, and autoplay.
- **Backend**: Node/Express API handling Google/YouTube OAuth, storing refresh tokens, and syncing the user's subscriptions into Postgres.
- **Database**: Postgres does the heavy lifting — joining cached videos with watched state and filtering per user preferences directly in SQL — leaving the API to handle remaining business logic (round-robin ordering, queue shaping).

## Commands

This is a pnpm workspace (`client`, `server`) with a root `package.json` orchestrating both.

```bash
# run client + server together (from repo root)
pnpm dev

# run individually
pnpm --filter server dev     # tsx watch src/index.ts
pnpm --filter client dev     # vite

# tests
pnpm --filter server test          # vitest run
pnpm --filter server test:watch
pnpm --filter client test          # vitest run
pnpm --filter client test:watch

# run a single test file
pnpm --filter client exec vitest run src/pages/AllPage.test.tsx
pnpm --filter server exec vitest run src/some/file.test.ts

# client build/lint
pnpm --filter client build   # tsc -b && vite build
pnpm --filter client lint

# database (dbmate via docker compose, uses .env.dbmate)
pnpm db:up       # apply migrations
pnpm db:status   # show migration status
pnpm db:new      # create a new migration file
```

Postgres itself runs via `docker-compose.yml` (`better-yt-tv-db` service, port 5432). Migrations live in `server/src/db/migrations/`; the schema dump lives at both `server/src/db/schema.sql` and `db/schema.sql`.

### Environment

Server config is validated with zod in `server/src/config/env.ts` and loaded from a repo-root `.env` (see `.env.example`). Required vars include `DATABASE_URL`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`/`SECRET`, `OAUTH_CALLBACK_URL`, `CLIENT_ORIGIN`, `YOUTUBE_CACHE_TTL_MINUTES`. Docker/dbmate config is separate, in `.env.dbmate` (see `.env.dbmate.example`).

## Commit messages

Imperative subject line under 50 chars, blank line, then bulleted body — one bullet per change, with the reason in parentheses at the end of each bullet.

## Architecture

### Auth flow (cookie sessions, not JWTs)

- `GET /api/auth/login` → redirects to Google OAuth (`server/src/auth/google.ts` builds the URL), with a CSRF `state` stored in an httpOnly `oauth_state` cookie.
- `GET /api/auth/callback` → exchanges the code for tokens, upserts the `users` row by `google_sub`, encrypts and stores the refresh token in `oauth_tokens` (`server/src/auth/crypto.ts`), revokes any prior active sessions, creates a new row in `sessions`, and sets an httpOnly `sid` cookie (30-day TTL). Only one active session per user is kept at a time.
- `requireAuth` middleware (`server/src/auth/requireAuth.ts`) looks up `sid` against `sessions` (must be non-revoked and unexpired) and attaches `userId`/`sessionId` to the request.
- YouTube API calls need a live Google access token, minted on demand from the stored refresh token (`getGoogleAccessToken` in `routes/youtube.ts`). If Google reports `invalid_grant` (revoked/expired refresh token), `withYoutubeReauthHandling` (`server/src/routes/youtubeAuthGuard.ts`) wraps the route handler, deletes the user's `oauth_tokens`, revokes their session, clears the cookie, and returns `401 YOUTUBE_REAUTH_REQUIRED` so the client knows to force a fresh login (distinct from a plain `401 AUTH_REQUIRED`).

### Data model and sync pipeline

Tables (see `db/schema.sql`): `users`, `oauth_tokens`, `sessions`, `user_subscriptions`, `channel_preferences`, `videos_cache`, `channel_recent_cache_state`, `user_video_state`. (`billing_customers`/`entitlements` exist in the schema but aren't wired into any routes yet.)

1. `POST /api/youtube/sync-subscriptions` fetches the user's subscriptions from the YouTube Data API and upserts them into `user_subscriptions`, creating a default `channel_preferences` row (`enabled_all`/`enabled_live`/`excluded_shorts` all true) per channel if one doesn't exist yet.
2. `POST /api/youtube/refresh-all-cache` iterates the user's subscribed channels, skips any whose `channel_recent_cache_state.cache_expires_at` hasn't passed (`YOUTUBE_CACHE_TTL_MINUTES`), and for stale channels fetches recent videos (`server/src/youtube/videos.ts`) and upserts them into `videos_cache`. This cache is shared across users of the same channel, not per-user.
3. `GET /api/feed/all` is the read path: a single SQL query joins `user_subscriptions` → `channel_preferences` → `videos_cache` → `user_video_state`, filtering on `enabled_all = true` and the shorts-exclusion rule (a video is treated as a short only if `duration_seconds` is known AND ≤ 60s — unknown duration is kept rather than hidden), and returns `is_watched` per video. This is the query the README refers to when it says Postgres does "the heavy lifting."
4. Per-channel preferences are read/written via `GET /api/channels` and `PATCH /api/channels/:channelId` / `PATCH /api/channels/bulk` (`server/src/routes/channels.ts`) — both build partial `UPDATE` statements dynamically so the client can send only the fields it changed.
5. Watch state: `POST /api/feed/videos/:videoId/watch` and `/unwatch` upsert into `user_video_state` (`source` is one of `ended`/`manual`/`reset`); unwatching keeps the row but nulls `watched_at` rather than deleting it.

### Client structure

- `client/src/lib/api.ts` is the single point of contact with the backend — every endpoint has a typed wrapper here (`apiFetch` handles JSON errors uniformly into `ApiError` with `status`/`code`). Add new server routes here too, rather than calling `fetch` ad hoc from components.
- `shouldRedirectToLogin(err)` centralizes the check for `401` + `AUTH_REQUIRED`/`YOUTUBE_REAUTH_REQUIRED` — use it wherever a fetch might fail due to auth rather than re-checking status codes inline.
- `App.tsx` loads the current user via `whoami` on mount and drives nav/auth UI; routes are plain `react-router-dom` under `App.tsx`, with `/settings` as a nested layout (`SettingsLayout` + `ChannelsSettingsPage`/`ListsSettingsPage`).
- `components/Player/YoutubePlayer.tsx` wraps the YouTube IFrame API and is the piece responsible for autoplay/watched-state side effects during playback (as opposed to the manual watch/unwatch toggle in the feed UI).
