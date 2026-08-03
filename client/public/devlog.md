
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


