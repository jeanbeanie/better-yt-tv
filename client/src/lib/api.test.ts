import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ApiError,
  getAllFeed,
  markVideoWatched,
  markVideoUnwatched,
  shouldRedirectToLogin,
  refreshAllCache,
  syncSubscriptions,
  getAppSettings,
  updateAppSettings,
  getLoginUrl,
  saveInviteCode,
} from "./api";
import { DEMO_REFRESHED_CHANNELS, DEMO_CACHED_VIDEOS } from "./demo/demoRefresh";

function mockFetchOnce(body: string, status: number) {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, { status })) as unknown as typeof fetch;
}

async function getFeedError() {
  return getAllFeed().catch((err) => err);
}

describe("apiFetch error parsing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts the message from a well-formed JSON error body", async () => {
    mockFetchOnce(JSON.stringify({ error: "Not found" }), 404);

    const err = await getFeedError();

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "Not found", status: 404 });
  });

  it("falls back cleanly instead of throwing when the body isn't JSON at all", async () => {
    // Simulates hitting an unmatched route: Express's default HTML 404 page,
    // which resp.json() fails to parse -- this is the exact case the old
    // (always-true) isApiErrorPayload let a `null` payload through for,
    // causing payload.message to throw a raw TypeError instead of this.
    mockFetchOnce("<html>Cannot GET /nope</html>", 404);

    const err = await getFeedError();

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "all feed failed: 404", status: 404 });
  });

  it("falls back cleanly when the JSON body isn't an object", async () => {
    mockFetchOnce(JSON.stringify("just a string"), 500);

    const err = await getFeedError();

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "all feed failed: 500", status: 500 });
  });
});

describe("mark watched/unwatched auth handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const authErrorBody = JSON.stringify({
    code: "AUTH_REQUIRED",
    message: "Your session is no longer valid. Please sign in again.",
  });

  it("markVideoWatched surfaces an ApiError that triggers a login redirect on 401", async () => {
    mockFetchOnce(authErrorBody, 401);

    const err = await markVideoWatched("v1").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(shouldRedirectToLogin(err)).toBe(true);
  });

  it("markVideoUnwatched surfaces an ApiError that triggers a login redirect on 401", async () => {
    mockFetchOnce(authErrorBody, 401);

    const err = await markVideoUnwatched("v1").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(shouldRedirectToLogin(err)).toBe(true);
  });
});

describe("refreshAllCache request dedup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const resultBody = JSON.stringify({
    ok: true,
    refreshPaused: false,
    refreshedChannels: 1,
    skippedChannels: 0,
    failedChannels: 0,
    cachedVideos: 3,
  });

  it("shares one request across concurrent calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(resultBody, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const [first, second] = await Promise.all([refreshAllCache(), refreshAllCache()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("fires a new request once the previous one has resolved", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(resultBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(resultBody, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // manual: true so neither call is blocked by the cooldown, this test is
    // only about the in-flight guard clearing after resolution
    await refreshAllCache({ manual: true });
    await refreshAllCache({ manual: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears the in-flight request on failure, so a later call can retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(refreshAllCache()).rejects.toBeInstanceOf(ApiError);
    await expect(refreshAllCache()).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("refreshAllCache cooldown", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const resultBody = JSON.stringify({
    ok: true,
    refreshPaused: false,
    refreshedChannels: 1,
    skippedChannels: 0,
    failedChannels: 0,
    cachedVideos: 3,
  });

  const pausedResultBody = JSON.stringify({
    ok: true,
    refreshPaused: true,
    refreshedChannels: 0,
    skippedChannels: 0,
    failedChannels: 0,
    cachedVideos: 0,
  });

  it("skips the network call on a second auto call within the cooldown, reusing the last refreshPaused value", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(pausedResultBody, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = await refreshAllCache();
    const second = await refreshAllCache();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.refreshPaused).toBe(true);
    expect(second).toEqual({
      ok: true,
      refreshPaused: true,
      refreshedChannels: 0,
      skippedChannels: 0,
      failedChannels: 0,
      cachedVideos: 0,
    });
  });

  it("lets a manual call through even right after an auto call", async () => {
    // a fresh Response per call, since a Response body can only be read once
    const fetchMock = vi.fn().mockImplementation(async () => new Response(resultBody, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await refreshAllCache();
    await refreshAllCache({ manual: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends manual: true in the request body for a manual call, manual: false otherwise", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(resultBody, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await refreshAllCache({ manual: true });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ manual: true });
  });

  it("does not start a cooldown on a failed call, so the next auto call still fires", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response(resultBody, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(refreshAllCache()).rejects.toBeInstanceOf(ApiError);
    await refreshAllCache();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("syncSubscriptions request", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a bare POST with credentials and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, syncedCount: 4 }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await syncSubscriptions();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5179/api/youtube/sync-subscriptions", { method: "POST", credentials: "include" });
    expect(result).toEqual({ ok: true, syncedCount: 4 });
  });

  it("throws an ApiError with the fallback message when the body has none", async () => {
    mockFetchOnce("{}", 500);

    const err = await syncSubscriptions().catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "sync subscriptions failed: 500", status: 500 });
  });
});

describe("refreshAllCache request shape", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const resultBody = JSON.stringify({
    ok: true,
    refreshPaused: false,
    refreshedChannels: 1,
    skippedChannels: 0,
    failedChannels: 0,
    cachedVideos: 3,
  });

  it("sends a POST with credentials, a JSON content-type header, and the manual flag in the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(resultBody, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await refreshAllCache({ manual: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5179/api/youtube/refresh-all-cache", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual: true }),
    });
  });

  it("sends manual: false for an automatic call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(resultBody, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await refreshAllCache();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(JSON.stringify({ manual: false }));
  });

  it("throws an ApiError with the fallback message when the body has none", async () => {
    mockFetchOnce("{}", 500);

    const err = await refreshAllCache({ manual: true }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "refresh all cache failed: 500", status: 500 });
  });
});

describe("app settings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const settingsBody = JSON.stringify({
    refreshPaused: true,
    updatedAt: "2026-08-21T00:00:00.000Z",
    updatedBy: "admin-user-id",
  });

  it("getAppSettings returns the parsed settings", async () => {
    mockFetchOnce(settingsBody, 200);

    const settings = await getAppSettings();

    expect(settings).toEqual({
      refreshPaused: true,
      updatedAt: "2026-08-21T00:00:00.000Z",
      updatedBy: "admin-user-id",
    });
  });

  it("updateAppSettings sends a PATCH with a JSON content-type header and the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(settingsBody, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const settings = await updateAppSettings({ refreshPaused: true });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ refreshPaused: true }));
    expect(settings.refreshPaused).toBe(true);
  });
});

describe("getLoginUrl", () => {
  it("returns a bare login URL when no invite code is saved", () => {
    expect(getLoginUrl()).toBe("http://localhost:5179/api/auth/login");
  });

  it("attaches a saved invite code as a query param", () => {
    saveInviteCode("code-1");

    expect(getLoginUrl()).toBe("http://localhost:5179/api/auth/login?invite=code-1");
  });

  it("percent-encodes a saved code that needs it", () => {
    saveInviteCode("code with spaces");

    expect(getLoginUrl()).toBe(
      "http://localhost:5179/api/auth/login?invite=code%20with%20spaces",
    );
  });
});

describe("demo mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  function installLeakMock() {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it("serves every wrapper from demoFetch and never calls fetch", async () => {
    window.history.pushState({}, "", "/demo/all");
    const fetchMock = installLeakMock();

    const watched = await markVideoWatched("v1");
    const unwatched = await markVideoUnwatched("v1");
    const syncErr = await syncSubscriptions().catch((err) => err);

    expect(watched).toEqual({ ok: true });
    expect(unwatched).toEqual({ ok: true });
    expect(syncErr).toBeInstanceOf(ApiError);
    expect(syncErr).toMatchObject({ message: "Not found", status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("refreshAllCache returns the canned manual result without touching fetch or storage", async () => {
    window.history.pushState({}, "", "/demo/all");
    const fetchMock = installLeakMock();

    const result = await refreshAllCache({ manual: true });

    expect(result).toEqual({
      ok: true,
      refreshPaused: false,
      refreshedChannels: DEMO_REFRESHED_CHANNELS,
      skippedChannels: 0,
      failedChannels: 0,
      cachedVideos: DEMO_CACHED_VIDEOS,
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(window.localStorage.getItem("betterYtTv.lastAutoRefreshAt")).toBeNull();
  });

  it("refreshAllCache returns zeros for a background call", async () => {
    window.history.pushState({}, "", "/demo/all");
    const fetchMock = installLeakMock();

    const result = await refreshAllCache();

    expect(result).toEqual({
      ok: true,
      refreshPaused: false,
      refreshedChannels: 0,
      skippedChannels: 0,
      failedChannels: 0,
      cachedVideos: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(window.localStorage.getItem("betterYtTv.lastAutoRefreshAt")).toBeNull();
  });

  it("a demo refresh leaves no cooldown behind for the real app", async () => {
    window.history.pushState({}, "", "/demo/all");
    const demoFetchMock = installLeakMock();
    await refreshAllCache();
    expect(demoFetchMock).toHaveBeenCalledTimes(0);

    window.history.pushState({}, "", "/");
    const realFetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            refreshPaused: false,
            refreshedChannels: 1,
            skippedChannels: 0,
            failedChannels: 0,
            cachedVideos: 4,
          }),
          { status: 200 },
        ),
      );
    globalThis.fetch = realFetchMock as unknown as typeof fetch;

    await refreshAllCache();

    expect(realFetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("non-demo fetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getAllFeed calls fetch with the API url and credentials", async () => {
    window.history.pushState({}, "", "/");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getAllFeed();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5179/api/feed/all",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
