
---

## 08-04-2026 - Lists feature: wiring up PUT /api/lists/:listId

Wrapped up the last of the four core list management routes today: GET /api/lists, POST /api/lists, GET /api/lists/:listId, and now PUT /api/lists/:listId, which saves a list's name and its full channel membership in one request from the (eventual) editor page.

This one's structurally different from everything else built in the API so far, so it's worth writing down why.

Every other write in this app (syncing subscriptions, marking a video watched, refreshing the OAuth token) boils down to a single SQL statement, usually an upsert (insert ... on conflict do update). A single statement is atomic for free; Postgres guarantees it either fully applies or doesn't happen at all. Nothing to think about.

PUT /api/lists/:listId isn't that. Saving a list means doing five things in sequence: check the requester actually owns this list, rename it, validate the submitted channel IDs against what the user's actually subscribed to, wipe the old membership, and insert the new one. Five separate statements, and they only make sense as a set. If the rename succeeds but the membership swap doesn't, the list is left with a name that doesn't match what the user thinks they saved. Worse, imagine the old membership gets deleted, and then the rename fails because the new name collides with another list. Now the user gets a clean 409 error back, but their list has silently lost every channel in it. A failure that looks safe on the outside while quietly corrupting data underneath. That's the scenario that felt most worth getting right.

The fix is the classic one: wrap the whole sequence in BEGIN ... COMMIT, and ROLLBACK the instant anything throws. If the rename collides, the catch block fires, issues ROLLBACK, and Postgres unwinds every statement issued since BEGIN, the delete included, even though it already technically ran. From the database's point of view, it's as if none of the five statements ever happened. The 409 response and the actual DB state agree with each other again.

One catch: this meant reaching for pool.connect() instead of the pool.query() used everywhere else in the codebase. pool.query() grabs whatever connection is free in the pool and hands it back per call, great for one off statements, useless for a transaction, since BEGIN/COMMIT/ROLLBACK only mean anything within a single database session. If two statements in the "transaction" ended up on different pooled connections, they wouldn't be in the same transaction at all. So this route checks out one dedicated client, threads it through all five statements, and releases it back to the pool in a finally block no matter how the handler exits.

Small route, but it's the first place in the codebase that needed this pattern; everything before it could get by on each statement just being safe on its own. This is the first time that wasn't enough.

---

## 08-03-2026 - apiFetch and ApiError

Our API client layer started as a pile of standalone helper functions, one per endpoint, each calling `fetch` directly with its own `credentials: "include"` and its own hand rolled `if (!resp.ok) throw ...` check. That was fine when there were only a couple of endpoints, but as the surface grew to cover feed reads, watch/unwatch, channel settings, bulk updates, subscription sync, and cache refresh, every new function copy pasted the same boilerplate, and the error handling drifted. Some functions threw a plain `Error` with the status code jammed into the message string, with no consistent way for a caller to tell what kind of failure happened without parsing text.

That became a real problem once YouTube reauth entered the picture. A 401 could mean "you're not logged in" or "your Google refresh token is dead and you need to reconnect," and those need different UI responses, but with a plain `Error` there was no structured way to tell them apart. The fix was to extend `Error` into an `ApiError` type carrying a `status` and an optional `code`, along with better handling of non OK responses, so the backend's `AUTH_REQUIRED` vs `YOUTUBE_REAUTH_REQUIRED` codes could actually survive the trip to the frontend instead of getting flattened into a string.

The next step added the `apiFetch` wrapper itself, in preparation for refactoring the client API functions' auth error handling: it centralizes the `credentials: "include"` call, response parsing, and `ApiError` throwing in one place, alongside a `shouldRedirectToLogin()` helper that checks for a 401 status with an `AUTH_REQUIRED` or `YOUTUBE_REAUTH_REQUIRED` code so callers don't each reimplement that check by hand. `getAllFeed` was updated to use it shortly after, replacing a duplicate function. Then the channel settings functions, `getChannels()` and `updateChannel()`, were switched over to the shared wrapper too. By the time `bulkUpdateChannels` was written, to update one setting preference across many channels in a single request, the wrapper already existed, so it was built directly on `apiFetch` from day one.

Not every function in `api.ts` uses `apiFetch` yet. `getWhoAmI`, `logout`, `getSubscriptions`, `syncSubscriptions`, `refreshAllCache`, `markVideoWatched`, and `markVideoUnwatched` still call `fetch` directly. That's a deliberate gradual migration rather than an oversight; each one gets converted as it's touched, rather than doing a single risky sweep through every endpoint at once.

---

## 07-20-2026 - First Entry

Welcome to the development log for Better YT TV (Working Title)

Changes, updates, and reflections will be added here.


