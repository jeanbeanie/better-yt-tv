# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal YouTube viewing dashboard: watch the most recent uploads from only the channels you're subscribed to, like a TV queue for your subscriptions.

- **Frontend**: Vite + React SPA, with a custom `Player` component built around the YouTube IFrame API for playback, watched state, and autoplay.
- **Backend**: Node/Express API handling Google/YouTube OAuth, storing refresh tokens, and syncing the user's subscriptions into Postgres.
- **Database**: Postgres does the heavy lifting, joining cached videos with watched state and filtering per user preferences directly in SQL, leaving the API to handle remaining business logic (round-robin ordering, queue shaping).

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

Postgres itself runs via `docker-compose.yml` (`db` service, port 5432). Migrations live in `server/src/db/migrations/`; the schema dump lives at `server/src/db/schema.sql`.

### Environment

Server config is validated with zod in `server/src/config/env.ts` and loaded from a repo-root `.env` (see `.env.example`). Required vars include `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`/`SECRET`, `OAUTH_CALLBACK_URL`, `CLIENT_ORIGIN`, `YOUTUBE_CACHE_TTL_MINUTES`. Docker/dbmate config is separate, in `.env.dbmate` (see `.env.dbmate.example`).

## Commit messages

Imperative subject line under 50 chars, blank line, then a bulleted body: one bullet per real change, naming the actual function/file/identifier rather than describing it abstractly. Keep bullets short: no trailing periods, no unnecessary hyphens, no em dashes, no semicolons. State what changed, not why it's fine or how it was tested. Drop self-justifying or "so that..." explanatory clauses. Check `git log` before drafting so a bullet doesn't restate reasoning from a recent earlier commit. For a small or mechanical change, a subject line alone is often enough, so don't pad it into bullets it doesn't need.

## Architecture

### Auth flow (cookie sessions, not JWTs)

- `GET /api/auth/login` → redirects to Google OAuth (`server/src/auth/google.ts` builds the URL), with a CSRF `state` stored in an httpOnly `oauth_state` cookie.
- `GET /api/auth/callback` → exchanges the code for tokens, upserts the `users` row by `google_sub`, encrypts and stores the refresh token in `oauth_tokens` (`server/src/auth/crypto.ts`), revokes any prior active sessions, creates a new row in `sessions`, and sets an httpOnly `sid` cookie (30-day TTL). Only one active session per user is kept at a time.
- `requireAuth` middleware (`server/src/auth/requireAuth.ts`) looks up `sid` against `sessions` (must be non-revoked and unexpired) and attaches `userId`/`sessionId` to the request.
- YouTube API calls need a live Google access token, minted on demand from the stored refresh token (`getGoogleAccessToken` in `routes/youtube.ts`). If Google reports `invalid_grant` (revoked/expired refresh token), `withYoutubeReauthHandling` (`server/src/routes/youtubeAuthGuard.ts`) wraps the route handler, deletes the user's `oauth_tokens`, revokes their session, clears the cookie, and returns `401 YOUTUBE_REAUTH_REQUIRED` so the client knows to force a fresh login (distinct from a plain `401 AUTH_REQUIRED`).

### Data model and sync pipeline

Tables (see `server/src/db/schema.sql`): `users`, `oauth_tokens`, `sessions`, `user_subscriptions`, `channel_preferences`, `videos_cache`, `channel_recent_cache_state`, `user_video_state`. (`billing_customers`/`entitlements` exist in the schema but aren't wired into any routes yet.)

1. `POST /api/youtube/sync-subscriptions` fetches the user's subscriptions from the YouTube Data API and upserts them into `user_subscriptions`, creating a default `channel_preferences` row (`enabled_all`/`enabled_live`/`excluded_shorts` all true) per channel if one doesn't exist yet.
2. `POST /api/youtube/refresh-all-cache` iterates the user's subscribed channels, skips any whose `channel_recent_cache_state.cache_expires_at` hasn't passed (`YOUTUBE_CACHE_TTL_MINUTES`), and for stale channels fetches recent videos (`server/src/youtube/videos.ts`) and upserts them into `videos_cache`. This cache is shared across users of the same channel, not per-user.
3. `GET /api/feed/all` is the read path: a single SQL query joins `user_subscriptions` → `channel_preferences` → `videos_cache` → `user_video_state`, filtering on `enabled_all = true` and the shorts-exclusion rule (a video is treated as a short only if `duration_seconds` is known AND ≤ 60s; unknown duration is kept rather than hidden), and returns `is_watched` per video. This is the query the README refers to when it says Postgres does "the heavy lifting."
4. Per-channel preferences are read/written via `GET /api/channels` and `PATCH /api/channels/:channelId` / `PATCH /api/channels/bulk` (`server/src/routes/channels.ts`); both build partial `UPDATE` statements dynamically so the client can send only the fields it changed.
5. Watch state: `POST /api/feed/videos/:videoId/watch` and `/unwatch` upsert into `user_video_state` (`source` is one of `ended`/`manual`/`reset`); unwatching keeps the row but nulls `watched_at` rather than deleting it.

### Client structure

- `client/src/lib/api.ts` is the single point of contact with the backend; every endpoint has a typed wrapper here (`apiFetch` handles JSON errors uniformly into `ApiError` with `status`/`code`). Add new server routes here too, rather than calling `fetch` ad hoc from components.
- `shouldRedirectToLogin(err)` centralizes the check for `401` + `AUTH_REQUIRED`/`YOUTUBE_REAUTH_REQUIRED`; use it wherever a fetch might fail due to auth rather than re-checking status codes inline.
- `App.tsx` loads the current user via `whoami` on mount and drives nav/auth UI; routes are plain `react-router-dom` under `App.tsx`, with `/settings` as a nested layout (`SettingsLayout` + `ChannelsSettingsPage`/`ListsSettingsPage`).
- `components/Player/YoutubePlayer.tsx` wraps the YouTube IFrame API and is the piece responsible for autoplay/watched-state side effects during playback (as opposed to the manual watch/unwatch toggle in the feed UI).

## Working preferences (Jeane)

These apply to real feature/development work in this repo, not to quick
one-off questions, casual exploration, or "just explain this" asks.

### Git & commits
- Never run `git add` or `git commit` yourself. When a meaningful chunk of
  work is complete (a phase, a bug fix, a feature slice, not every single
  tool call), show the diff and propose a commit message; I commit it myself.
- Commit message format: see "Commit messages" above.
- If you find and fix something unrelated to the current task while working
  (e.g. a pre-existing bug, drift, or fragility you notice along the way),
  give it its own separate commit. Don't bundle it into the feature commit.
- Never run `git push`, database migrations/seeds, or deploy steps either,
  same reasoning as commits, since I want to keep my own muscle memory for
  these. Finish the work, show the diff, and hand over the exact commands
  for me to run.
- When a plan defines multiple commits, stop with the working tree holding
  exactly one commit's worth of changes before starting the next. Never let
  two commits' work land together and then suggest `git add -p` or
  squashing as a way out of it.
- When proposing multiple commits, list the exact files per commit, and
  proactively flag any uncommitted changes before starting a new phase.

### Workflow / pacing
- For anything nontrivial or multi-file, start in Plan Mode and let me
  review the plan before writing code.
- Work one phase/task at a time. Stop after each one, show me what changed,
  and wait for explicit approval before continuing to the next.
- If a single answer or instruction I gave could reasonably apply to more
  than one open question, don't assume it covers both. Ask me to confirm
  it applies to each, rather than guessing.
- A plan isn't complete until it states the commit count, the files per
  commit, and whether the app stays working in between (default: yes, every
  commit leaves it deployable, unless I say otherwise for that specific plan).
- Touch only what was asked. Don't tidy, fix, or remove adjacent code or
  comments that weren't part of the request. Mention what you noticed
  instead of changing it.
- Once a diff is approved, don't extend it without saying what's different
  from what was approved and why.
- For a structural or nontrivial change, show the resulting code and the
  reasoning before applying it, and let me choose between real alternatives
  rather than picking one silently.
- For naming (files, functions, variables, CSS classes, user-facing labels)
  or wording decisions, offer a couple of labeled options with a lean,
  rather than committing to one choice silently or asking a fully open
  question.
- A word or phrasing I reject is off-limits for the rest of the session,
  everywhere, not just the line it was rejected on.

### Visual / UI changes
- Confirm the concrete before/after in words before editing anything
  visual, and ask for a screenshot of the current state rather than
  guessing from a description.
- Implement one version, stop, and let me look at it in the browser before
  trying alternatives. Don't pre-build multiple options.
- For UI gated behind a condition (empty state, first-time callout,
  admin-only), offer to temporarily force it visible for preview, then
  revert before committing.
- This app gets used on mobile. State how any layout/CSS change behaves at
  narrow widths, and avoid hardcoded pixel widths.

### Environment safety
- Never kill or pkill a process by matching name or port. I run long-lived
  dev servers and tmux sessions of my own; only stop processes you started
  yourself, and ask before touching anything else.
- Name the side effects of a command before running it, not after,
  especially anything that could rewrite tracked files (e.g. `pnpm
  db:up:production` regenerating `schema.sql`).
- Quote glob patterns in shell commands (`--include='*.ts'`). The bare
  form breaks in my zsh.

### Testing
- Write tests alongside the feature that needs them, not deferred to a
  separate "add tests" pass at the end.
- Before showing me a diff, run the full existing test suite (not just new
  tests) so regressions in earlier work get caught immediately.
- Delete any scratch/temporary test files and test-only DB rows created
  purely for manual verification before showing me the diff or commit
  message. Confirm via `git status` that nothing stray is left staged or
  untracked.
- Before writing a new test-mocking pattern, styling convention, or file
  structure, grep for the nearest existing example in the repo and match
  it rather than inventing a new one.

### Data safety
- Never write real secrets, session IDs, tokens, or credentials into any
  file, even temporarily or in a file meant to be deleted later. Use
  environment variables for anything sensitive, even in throwaway scripts.
- For a destructive step touching real data (dropping a volume, resetting
  a table), capture a baseline first, run and show verification against
  it, name the point of no return explicitly, then wait for explicit
  go-ahead.
- A new environment variable goes in both `.env.example` and the local
  `.env`.
- Before using `Write` on any path, verify it exists first via `ls`/`Read`
  on that exact path. Never infer non-existence from an unrelated grep
  returning no matches (this has caused a near-miss more than once).

### Defensive DB/code patterns
- When a relationship between two tables is only guaranteed by application
  code (not a DB foreign key, NOT NULL constraint, or transaction), prefer
  a left join + `coalesce(...)` with a sensible default over an inner join,
  failing open (missing data gets a default) rather than failing closed
  (missing data silently disappears), unless there's a specific reason the
  opposite is correct.

### Prose & comment style
- No em dashes, unnecessary hyphens, or double-dash "--" separators
  anywhere: code comments, commit messages, README/changelog, UI copy,
  docs.
- Code comments: short fragments, not complete sentences. No trailing
  periods, no semicolons, no "so that..." explanatory tone.
- Don't reference session-transient context in a comment ("the fix", "this
  bug", "as discussed") since that context won't persist. Describe the
  current behavior instead.
- When multiple comments would repeat the same rationale, explain it once
  and have the rest point back to it.
- When touching an older file, opportunistically bring its comments in
  line with this style too.
