import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import type { QueryResult } from "pg";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPool, mockedQuery, mockQueryResult } from "../testUtils/pgMocks.js";
import type { AuthedRequest } from "../auth/requireAuth.js";

// Mock the DB pool so no real Postgres connection is needed
vi.mock("../db/pool.js", () => ({
  pool: createMockPool(),
}));

// Bypass real session lookup, attach a fake userId like requireAuth would
vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as AuthedRequest).userId = "test-user-id";
    next();
  },
}));

vi.mock("../auth/crypto.js", () => ({
  decryptRefreshToken: vi.fn(() => "fake-refresh-token"),
}));

vi.mock("../auth/google.js", () => ({
  refreshAccessToken: vi.fn(async () => ({
    access_token: "fake-access-token",
    expires_in: 3600,
    expires_at: Date.now() + 3600_000,
  })),
}));

vi.mock("../youtube/quota.js", () => ({
  recordQuotaUsage: vi.fn(),
}));

vi.mock("../youtube/videos.js", () => ({
  getChannelCacheState: vi.fn(),
  fetchRecentVideosForChannel: vi.fn(),
  upsertVideosCache: vi.fn(),
  markChannelCacheRefreshed: vi.fn(),
}));

vi.mock("../settings/appSettings.js", () => ({
  getAppSettings: vi.fn(),
}));

vi.mock("../youtube/live.js", () => ({
  getDueLiveChannels: vi.fn(),
  findVideoIdsToClassify: vi.fn(),
  findUpcomingVideoIds: vi.fn(),
  fetchRssIdsForChannels: vi.fn(),
  classifyVideos: vi.fn(),
  markLiveChannelsChecked: vi.fn(),
}));

vi.mock("../auth/revoke.js", () => ({
  revokeSessionAndTokens: vi.fn(),
}));

const { pool } = await import("../db/pool.js");
const { recordQuotaUsage } = await import("../youtube/quota.js");
const {
  getChannelCacheState,
  fetchRecentVideosForChannel,
  upsertVideosCache,
  markChannelCacheRefreshed,
} = await import("../youtube/videos.js");
const { getAppSettings } = await import("../settings/appSettings.js");
const { refreshAccessToken } = await import("../auth/google.js");
const {
  getDueLiveChannels,
  fetchRssIdsForChannels,
  findVideoIdsToClassify,
  findUpcomingVideoIds,
  classifyVideos,
  markLiveChannelsChecked,
} = await import("../youtube/live.js");
const { revokeSessionAndTokens } = await import("../auth/revoke.js");
const { env } = await import("../config/env.js");
const { youtubeRouter } = await import("./youtube.js");

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/youtube", youtubeRouter);
  return app;
}

function mockSubscriptionsFetch(items: Array<{ channelId: string; title: string; thumbUrl: string | null }>) {
  global.fetch = vi.fn(async () =>
    new Response(
      JSON.stringify({
        items: items.map((item) => ({
          snippet: {
            resourceId: { channelId: item.channelId },
            title: item.title,
            thumbnails: item.thumbUrl ? { medium: { url: item.thumbUrl } } : {},
          },
        })),
      }),
      { status: 200 },
    ),
  ) as unknown as typeof fetch;
}

function mockPagedSubscriptionsFetch(pages: Array<Array<{ channelId: string; title: string }>>) {
  global.fetch = vi.fn(async (url: string | URL) => {
    const pageIndex = new URL(url).searchParams.get("pageToken") === "page2" ? 1 : 0;
    const items = pages[pageIndex];
    const isLastPage = pageIndex === pages.length - 1;

    return new Response(
      JSON.stringify({
        items: items.map((item) => ({
          snippet: { resourceId: { channelId: item.channelId }, title: item.title, thumbnails: {} },
        })),
        nextPageToken: isLastPage ? undefined : "page2",
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

// getGoogleAccessToken always looks up oauth_tokens first, regardless of
// what the sync insert itself does, stub that lookup so tests can focus
// on the subscriptions/preferences insert in isolation
function mockOauthTokenLookup(
  onSyncInsert: (params: unknown[]) => Promise<QueryResult>,
) {
  mockedQuery(vi.mocked(pool.query)).mockImplementation(async (sql, params) => {
    if (sql.includes("oauth_tokens")) {
      return mockQueryResult({
        rows: [{ refresh_token_ciphertext: "fake-ciphertext" }],
        rowCount: 1,
      });
    }
    return onSyncInsert(params ?? []);
  });
}

function syncInsertCalls() {
  return mockedQuery(vi.mocked(pool.query)).mock.calls.filter(([sql]) =>
    sql.includes("with subs as"),
  );
}

describe("POST /api/youtube/sync-subscriptions", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("upserts subscriptions and preferences in a single query", async () => {
    mockSubscriptionsFetch([
      { channelId: "chan1", title: "Channel One", thumbUrl: "https://example.com/1.jpg" },
      { channelId: "chan2", title: "Channel Two", thumbUrl: null },
    ]);
    mockOauthTokenLookup(async () => mockQueryResult({ rows: [], rowCount: 0 }));

    const res = await request(buildApp())
      .post("/api/youtube/sync-subscriptions")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, syncedCount: 2 });

    // One statement for the whole subscriptions+preferences write, not one
    // pair of queries per subscription
    const calls = syncInsertCalls();
    expect(calls).toHaveLength(1);
    const [sql, params] = calls[0];
    expect(sql).toContain("insert into channel_preferences");
    expect(params).toEqual([
      "test-user-id",
      ["chan1", "chan2"],
      ["Channel One", "Channel Two"],
      ["https://example.com/1.jpg", null],
    ]);
  });

  it("skips the insert entirely when there are no subscriptions", async () => {
    mockSubscriptionsFetch([]);
    mockOauthTokenLookup(async () => mockQueryResult({ rows: [], rowCount: 0 }));

    const res = await request(buildApp())
      .post("/api/youtube/sync-subscriptions")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, syncedCount: 0 });
    expect(syncInsertCalls()).toHaveLength(0);
  });

  it("surfaces a DB failure as a 500 rather than a partial write", async () => {
    mockSubscriptionsFetch([{ channelId: "chan1", title: "Channel One", thumbUrl: null }]);
    mockOauthTokenLookup(async () => {
      throw new Error("connection reset");
    });

    const res = await request(buildApp())
      .post("/api/youtube/sync-subscriptions")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(500);
    expect(syncInsertCalls()).toHaveLength(1);
  });

  it("records one subscriptions.list unit per page fetched, not per sync", async () => {
    mockPagedSubscriptionsFetch([
      [{ channelId: "chan1", title: "Channel One" }],
      [{ channelId: "chan2", title: "Channel Two" }],
    ]);
    mockOauthTokenLookup(async () => mockQueryResult({ rows: [], rowCount: 0 }));
    vi.mocked(recordQuotaUsage).mockReset();

    const res = await request(buildApp())
      .post("/api/youtube/sync-subscriptions")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(recordQuotaUsage).toHaveBeenCalledTimes(2);
    expect(recordQuotaUsage).toHaveBeenNthCalledWith(
      1,
      "subscriptions.list",
      1,
      expect.objectContaining({ action: "sync-subscriptions", userId: "test-user-id" }),
    );
    expect(recordQuotaUsage).toHaveBeenNthCalledWith(
      2,
      "subscriptions.list",
      1,
      expect.objectContaining({ action: "sync-subscriptions", userId: "test-user-id" }),
    );
  });

  it("shares one requestGroupId across every page fetched in a sync", async () => {
    mockPagedSubscriptionsFetch([
      [{ channelId: "chan1", title: "Channel One" }],
      [{ channelId: "chan2", title: "Channel Two" }],
    ]);
    mockOauthTokenLookup(async () => mockQueryResult({ rows: [], rowCount: 0 }));
    vi.mocked(recordQuotaUsage).mockReset();

    await request(buildApp())
      .post("/api/youtube/sync-subscriptions")
      .set("Cookie", "sid=fake-session");

    const [, , firstContext] = vi.mocked(recordQuotaUsage).mock.calls[0];
    const [, , secondContext] = vi.mocked(recordQuotaUsage).mock.calls[1];
    expect(firstContext?.requestGroupId).toBeTruthy();
    expect(secondContext?.requestGroupId).toBe(firstContext?.requestGroupId);
  });
});

function mockChannelIdsQuery(channelIds: string[]) {
  mockedQuery(vi.mocked(pool.query)).mockImplementation(async (sql) => {
    if (sql.includes("oauth_tokens")) {
      return mockQueryResult({
        rows: [{ refresh_token_ciphertext: "fake-ciphertext" }],
        rowCount: 1,
      });
    }
    if (sql.includes("from user_subscriptions us")) {
      return mockQueryResult({
        rows: channelIds.map((channel_id) => ({ channel_id })),
        rowCount: channelIds.length,
      });
    }
    throw new Error(`Unexpected query in mockChannelIdsQuery: ${sql}`);
  });
}

describe("POST /api/youtube/refresh-all-cache", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(getChannelCacheState).mockReset();
    vi.mocked(fetchRecentVideosForChannel).mockReset();
    vi.mocked(upsertVideosCache).mockReset();
    vi.mocked(markChannelCacheRefreshed).mockReset();
    vi.mocked(getAppSettings).mockReset();
    vi.mocked(getAppSettings).mockResolvedValue({
      refreshPaused: false,
      updatedAt: "2026-08-21T00:00:00.000Z",
      updatedBy: null,
    });
  });

  // pool.query is mocked, so this can't prove the WHERE clause actually
  // filters correctly against real data, it guards the query's shape,
  // so a future edit can't silently drop the list_channels override or
  // reintroduce enabled_live (see the comment above this query in
  // youtube.ts for why enabled_live is deliberately excluded)
  it("queries channel eligibility via channel_preferences and list_channels, never enabled_live", async () => {
    mockChannelIdsQuery([]);

    await request(buildApp())
      .post("/api/youtube/refresh-all-cache")
      .set("Cookie", "sid=fake-session");

    const call = mockedQuery(vi.mocked(pool.query)).mock.calls.find(([sql]) =>
      sql.includes("from user_subscriptions us"),
    );
    expect(call).toBeDefined();
    const sql = call![0];
    expect(sql).toContain("channel_preferences");
    expect(sql).toContain("list_channels");
    expect(sql).not.toContain("enabled_live");
  });

  it("returns zero counts and never checks staleness when there are no eligible channels", async () => {
    mockChannelIdsQuery([]);

    const res = await request(buildApp())
      .post("/api/youtube/refresh-all-cache")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      refreshPaused: false,
      refreshedChannels: 0,
      skippedChannels: 0,
      failedChannels: 0,
      cachedVideos: 0,
    });
    expect(getChannelCacheState).not.toHaveBeenCalled();
  });

  it("returns early without touching the db or youtube when the kill switch is paused", async () => {
    vi.mocked(getAppSettings).mockResolvedValue({
      refreshPaused: true,
      updatedAt: "2026-08-21T00:00:00.000Z",
      updatedBy: "admin-user-id",
    });

    const res = await request(buildApp())
      .post("/api/youtube/refresh-all-cache")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      refreshPaused: true,
      refreshedChannels: 0,
      skippedChannels: 0,
      failedChannels: 0,
      cachedVideos: 0,
    });
    expect(pool.query).not.toHaveBeenCalled();
    expect(getChannelCacheState).not.toHaveBeenCalled();
    expect(fetchRecentVideosForChannel).not.toHaveBeenCalled();
  });

  it("refreshes stale channels and skips fresh ones, tallying counts correctly", async () => {
    mockChannelIdsQuery(["chan1", "chan2"]);
    vi.mocked(getChannelCacheState).mockImplementation(async (channelId) => ({
      stale: channelId === "chan1",
      uploadsPlaylistId: null,
    }));
    vi.mocked(fetchRecentVideosForChannel).mockResolvedValue({
      videos: [
        { videoId: "v1", channelId: "chan1", title: "t", publishedAt: "2026-01-01", thumbUrl: null },
      ],
      uploadsPlaylistId: "UUchan1",
    });

    const res = await request(buildApp())
      .post("/api/youtube/refresh-all-cache")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      refreshPaused: false,
      refreshedChannels: 1,
      skippedChannels: 1,
      failedChannels: 0,
      cachedVideos: 1,
    });
    expect(fetchRecentVideosForChannel).toHaveBeenCalledTimes(1);
    expect(fetchRecentVideosForChannel).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "chan1" }),
    );
    expect(markChannelCacheRefreshed).toHaveBeenCalledWith("chan1", "UUchan1");
    expect(upsertVideosCache).toHaveBeenCalledTimes(1);
  });

  it("skips a channel that fails to refresh instead of aborting the whole run", async () => {
    mockChannelIdsQuery(["chan1", "chan2"]);
    vi.mocked(getChannelCacheState).mockImplementation(async (channelId) => ({
      stale: true,
      uploadsPlaylistId: channelId === "chan1" ? "UUchan1" : null,
    }));
    vi.mocked(fetchRecentVideosForChannel).mockImplementation(async (args) => {
      if (args.channelId === "chan1") {
        throw new Error("YouTube uploads playlist videos fetch failed: 404");
      }
      return {
        videos: [
          { videoId: "v2", channelId: "chan2", title: "t", publishedAt: "2026-01-01", thumbUrl: null },
        ],
        uploadsPlaylistId: "UUchan2",
      };
    });

    const res = await request(buildApp())
      .post("/api/youtube/refresh-all-cache")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      refreshPaused: false,
      refreshedChannels: 1,
      skippedChannels: 0,
      failedChannels: 1,
      cachedVideos: 1,
    });
    // the failed channel still gets marked refreshed, on its existing
    // cached playlist id, so it waits the normal ttl before retrying
    expect(markChannelCacheRefreshed).toHaveBeenCalledWith("chan1", "UUchan1");
    expect(markChannelCacheRefreshed).toHaveBeenCalledWith("chan2", "UUchan2");
    expect(upsertVideosCache).toHaveBeenCalledTimes(1);
  });

  it("passes an action, userId, and shared requestGroupId to every channel refreshed", async () => {
    mockChannelIdsQuery(["chan1", "chan2"]);
    vi.mocked(getChannelCacheState).mockResolvedValue({ stale: true, uploadsPlaylistId: null });
    vi.mocked(fetchRecentVideosForChannel).mockResolvedValue({
      videos: [],
      uploadsPlaylistId: "UUresolved",
    });

    await request(buildApp())
      .post("/api/youtube/refresh-all-cache")
      .set("Cookie", "sid=fake-session");

    expect(fetchRecentVideosForChannel).toHaveBeenCalledTimes(2);
    const [firstCallArgs] = vi.mocked(fetchRecentVideosForChannel).mock.calls[0];
    const [secondCallArgs] = vi.mocked(fetchRecentVideosForChannel).mock.calls[1];
    expect(firstCallArgs.quotaContext).toEqual({
      action: "refresh-all-cache:auto",
      userId: "test-user-id",
      requestGroupId: expect.any(String),
    });
    expect(secondCallArgs.quotaContext?.requestGroupId).toBe(firstCallArgs.quotaContext?.requestGroupId);
  });

  it("records action as refresh-all-cache:manual when the request body says manual", async () => {
    mockChannelIdsQuery(["chan1"]);
    vi.mocked(getChannelCacheState).mockResolvedValue({ stale: true, uploadsPlaylistId: null });
    vi.mocked(fetchRecentVideosForChannel).mockResolvedValue({
      videos: [],
      uploadsPlaylistId: "UUresolved",
    });

    await request(buildApp())
      .post("/api/youtube/refresh-all-cache")
      .set("Cookie", "sid=fake-session")
      .send({ manual: true });

    const [callArgs] = vi.mocked(fetchRecentVideosForChannel).mock.calls[0];
    expect(callArgs.quotaContext?.action).toBe("refresh-all-cache:manual");
  });

  it("passes a channel's cached uploads playlist id through to the fetch", async () => {
    mockChannelIdsQuery(["chan1"]);
    vi.mocked(getChannelCacheState).mockResolvedValue({
      stale: true,
      uploadsPlaylistId: "UUcached",
    });
    vi.mocked(fetchRecentVideosForChannel).mockResolvedValue({
      videos: [],
      uploadsPlaylistId: "UUcached",
    });

    await request(buildApp())
      .post("/api/youtube/refresh-all-cache")
      .set("Cookie", "sid=fake-session");

    expect(fetchRecentVideosForChannel).toHaveBeenCalledWith(
      expect.objectContaining({ cachedUploadsPlaylistId: "UUcached" }),
    );
    expect(markChannelCacheRefreshed).toHaveBeenCalledWith("chan1", "UUcached");
  });
});

// pool.query is mocked, so these return canned rows keyed on query shape
function mockLiveRowsQuery(rows: Array<{ channel_id: string; enabled_live: boolean }>) {
  mockedQuery(vi.mocked(pool.query)).mockImplementation(async (sql) => {
    if (sql.includes("oauth_tokens")) {
      return mockQueryResult({
        rows: [{ refresh_token_ciphertext: "fake-ciphertext" }],
        rowCount: 1,
      });
    }
    if (sql.includes("from user_subscriptions us")) {
      return mockQueryResult({
        rows,
        rowCount: rows.length,
      });
    }
    throw new Error(`Unexpected query in mockLiveRowsQuery: ${sql}`);
  });
}

// channels default to live enabled
function mockLiveChannelsQuery(channelIds: string[]) {
  mockLiveRowsQuery(channelIds.map((channel_id) => ({ channel_id, enabled_live: true })));
}

describe("POST /api/youtube/refresh-live", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(getAppSettings).mockReset();
    vi.mocked(getAppSettings).mockResolvedValue({
      refreshPaused: false,
      updatedAt: "2026-08-21T00:00:00.000Z",
      updatedBy: null,
    });
    vi.mocked(refreshAccessToken).mockReset();
    vi.mocked(getDueLiveChannels).mockReset();
    vi.mocked(findVideoIdsToClassify).mockReset();
    vi.mocked(findUpcomingVideoIds).mockReset();
    vi.mocked(findUpcomingVideoIds).mockResolvedValue([]);
    vi.mocked(classifyVideos).mockReset();
    vi.mocked(markLiveChannelsChecked).mockReset();
    vi.mocked(fetchRssIdsForChannels).mockReset();
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: [], attemptedChannelIds: [], failedChannels: 0 });
    vi.mocked(revokeSessionAndTokens).mockReset();
  });

  it("returns the paused response without querying or calling the live helpers", async () => {
    vi.mocked(getAppSettings).mockResolvedValue({
      refreshPaused: true,
      updatedAt: "2026-08-21T00:00:00.000Z",
      updatedBy: null,
    });

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, refreshPaused: true, checkedChannels: 0, rssAttemptedChannels: 0, rssFailedChannels: 0, classifiedVideos: 0 });
    expect(pool.query).not.toHaveBeenCalled();
    expect(getDueLiveChannels).not.toHaveBeenCalled();
    expect(findVideoIdsToClassify).not.toHaveBeenCalled();
    expect(classifyVideos).not.toHaveBeenCalled();
    expect(markLiveChannelsChecked).not.toHaveBeenCalled();
  });

  it("skips classification and token lookup when no channel is due", async () => {
    mockLiveChannelsQuery(["chan1"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue([]);

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, refreshPaused: false, checkedChannels: 0, rssAttemptedChannels: 0, rssFailedChannels: 0, classifiedVideos: 0 });
    expect(findVideoIdsToClassify).not.toHaveBeenCalled();
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(markLiveChannelsChecked).not.toHaveBeenCalled();
  });

  it("fetches one access token, classifies the ids, and marks the due channels checked", async () => {
    mockLiveChannelsQuery(["chan1", "chan2"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan1"]);
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: [], attemptedChannelIds: ["chan1"], failedChannels: 0 });
    vi.mocked(findVideoIdsToClassify).mockResolvedValue(["vid1", "vid2"]);
    vi.mocked(classifyVideos).mockResolvedValue(2);

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, refreshPaused: false, checkedChannels: 1, rssAttemptedChannels: 1, rssFailedChannels: 0, classifiedVideos: 2 });
    expect(findVideoIdsToClassify).toHaveBeenCalledWith(["chan1"], [], 1000);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(classifyVideos).toHaveBeenCalledWith({
      accessToken: "fake-access-token",
      videoIds: ["vid1", "vid2"],
      quotaContext: {
        action: "refresh-live",
        userId: "test-user-id",
        requestGroupId: expect.any(String),
      },
    });
    expect(markLiveChannelsChecked).toHaveBeenCalledWith(["chan1"]);
  });

  it("marks due channels checked without fetching a token when no ids need classifying", async () => {
    mockLiveChannelsQuery(["chan1"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan1"]);
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: [], attemptedChannelIds: ["chan1"], failedChannels: 0 });
    vi.mocked(findVideoIdsToClassify).mockResolvedValue([]);

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, refreshPaused: false, checkedChannels: 1, rssAttemptedChannels: 1, rssFailedChannels: 0, classifiedVideos: 0 });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(classifyVideos).not.toHaveBeenCalled();
    expect(markLiveChannelsChecked).toHaveBeenCalledWith(["chan1"]);
  });

  // pool.query is mocked, so this guards the query's shape, not its results
  // it keeps enabled_live as a left join with a fail-open default, selected for every channel
  // and does not filter on it in the where clause
  it("selects enabled_live with a left join to channel_preferences", async () => {
    mockLiveChannelsQuery([]);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    const call = mockedQuery(vi.mocked(pool.query)).mock.calls.find(([sql]) =>
      sql.includes("from user_subscriptions us"),
    );
    expect(call).toBeDefined();
    const sql = call![0];
    expect(sql).toContain("left join channel_preferences");
    expect(sql).toContain("coalesce(cp.enabled_live, true)");
    expect(sql).toContain("as enabled_live");
    expect(sql).not.toContain("enabled_all");
    expect(sql).not.toMatch(/where[\s\S]*enabled_live/);
  });

  it("passes the live cache ttl, not the general cache ttl, to getDueLiveChannels", async () => {
    mockLiveChannelsQuery(["chan1", "chan2"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue([]);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    // the assertion below only proves the live ttl is used when the two values differ
    expect(env.YOUTUBE_LIVE_CACHE_TTL_MINUTES).not.toBe(env.YOUTUBE_CACHE_TTL_MINUTES);
    expect(getDueLiveChannels).toHaveBeenCalledWith(
      ["chan1", "chan2"],
      env.YOUTUBE_LIVE_CACHE_TTL_MINUTES,
    );
  });

  it("responds 500 and does not mark channels checked when classification throws", async () => {
    mockLiveChannelsQuery(["chan1"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan1"]);
    vi.mocked(findVideoIdsToClassify).mockResolvedValue(["vid1"]);
    vi.mocked(classifyVideos).mockRejectedValue(new Error("YouTube video details fetch failed: 500 boom"));

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(500);
    expect(markLiveChannelsChecked).not.toHaveBeenCalled();
  });

  it("returns YOUTUBE_REAUTH_REQUIRED and does not mark channels checked on invalid_grant", async () => {
    mockLiveChannelsQuery(["chan1"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan1"]);
    vi.mocked(findVideoIdsToClassify).mockResolvedValue(["vid1"]);
    vi.mocked(refreshAccessToken).mockRejectedValueOnce(new Error("Refresh failed: 400 invalid_grant"));

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("YOUTUBE_REAUTH_REQUIRED");
    expect(revokeSessionAndTokens).toHaveBeenCalledWith("test-user-id", "fake-session");
    expect(classifyVideos).not.toHaveBeenCalled();
    expect(markLiveChannelsChecked).not.toHaveBeenCalled();
  });

  it("passes the rss ids, due channels and max ids to findVideoIdsToClassify", async () => {
    mockLiveChannelsQuery(["chan1", "chan2"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan1"]);
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: ["rssVid1"], attemptedChannelIds: ["chan1"], failedChannels: 0 });
    vi.mocked(findVideoIdsToClassify).mockResolvedValue([]);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(fetchRssIdsForChannels).toHaveBeenCalledWith(["chan1"]);
    expect(findVideoIdsToClassify).toHaveBeenCalledWith(["chan1"], ["rssVid1"], 1000);
  });

  it("reports the rss attempted and failed counts from the helper in the response", async () => {
    mockLiveChannelsQuery(["chan1"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan1", "chan2", "chan3"]);
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: [], attemptedChannelIds: ["chan1", "chan2"], failedChannels: 1 });
    vi.mocked(findVideoIdsToClassify).mockResolvedValue([]);

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, refreshPaused: false, checkedChannels: 2, rssAttemptedChannels: 2, rssFailedChannels: 1, classifiedVideos: 0 });
  });

  it("still classifies cached ids and marks only the attempted channels checked when every rss fetch failed", async () => {
    mockLiveChannelsQuery(["chan1", "chan2"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan1", "chan2"]);
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: [], attemptedChannelIds: ["chan1", "chan2"], failedChannels: 2 });
    vi.mocked(findVideoIdsToClassify).mockResolvedValue(["cachedVid"]);
    vi.mocked(classifyVideos).mockResolvedValue(1);

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, refreshPaused: false, checkedChannels: 2, rssAttemptedChannels: 2, rssFailedChannels: 2, classifiedVideos: 1 });
    expect(classifyVideos).toHaveBeenCalledWith(expect.objectContaining({ videoIds: ["cachedVid"] }));
    expect(markLiveChannelsChecked).toHaveBeenCalledWith(["chan1", "chan2"]);
  });

  it("does not call the rss helper when no channel is due", async () => {
    mockLiveChannelsQuery(["chan1"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue([]);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(fetchRssIdsForChannels).not.toHaveBeenCalled();
  });

  it("does not call the rss helper when no channel has live enabled", async () => {
    mockLiveChannelsQuery([]);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(fetchRssIdsForChannels).not.toHaveBeenCalled();
  });

  it("passes only the due channels to the rss helper", async () => {
    mockLiveChannelsQuery(["chan1", "chan2"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan2"]);
    vi.mocked(findVideoIdsToClassify).mockResolvedValue([]);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(fetchRssIdsForChannels).toHaveBeenCalledWith(["chan2"]);
  });

  it("marks only the rss attempted channels checked and classifies against all due channels", async () => {
    mockLiveChannelsQuery(["chan1", "chan2", "chan3", "chan4"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan1", "chan2", "chan3", "chan4"]);
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: [], attemptedChannelIds: ["chan1", "chan2"], failedChannels: 0 });
    vi.mocked(findVideoIdsToClassify).mockResolvedValue([]);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(findVideoIdsToClassify).toHaveBeenCalledWith(["chan1", "chan2", "chan3", "chan4"], [], 1000);
    expect(markLiveChannelsChecked).toHaveBeenCalledWith(["chan1", "chan2"]);
  });

  it("shares one run between concurrent requests from the same user", async () => {
    mockLiveChannelsQuery(["chan1"]);
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    vi.mocked(getDueLiveChannels).mockImplementation(async () => {
      await gate;
      return ["chan1"];
    });
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: [], attemptedChannelIds: ["chan1"], failedChannels: 0 });
    vi.mocked(findVideoIdsToClassify).mockResolvedValue([]);

    const app = buildApp();
    const first = request(app)
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");
    const second = request(app)
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");
    const responses = Promise.all([first, second]);

    // no hook marks handler arrival and supertest I/O is real, so a short wait is the only signal
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    const [a, b] = await responses;

    expect(getDueLiveChannels).toHaveBeenCalledTimes(1);
    expect(a.status).toBe(200);
    expect(a.body.checkedChannels).toBe(1);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
  });

  it("runs again for a request sent after the previous run finished", async () => {
    mockLiveChannelsQuery(["chan1"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue([]);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");
    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(getDueLiveChannels).toHaveBeenCalledTimes(2);
  });

  it("clears the guard after a failed run so the next request runs again", async () => {
    mockLiveChannelsQuery(["chan1"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan1"]);
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: [], attemptedChannelIds: ["chan1"], failedChannels: 0 });
    vi.mocked(findVideoIdsToClassify).mockResolvedValue(["vid1"]);
    vi.mocked(classifyVideos)
      .mockRejectedValueOnce(new Error("YouTube video details fetch failed: 500 boom"))
      .mockResolvedValue(1);

    const failed = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");
    const retried = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(failed.status).toBe(500);
    expect(retried.status).toBe(200);
    expect(getDueLiveChannels).toHaveBeenCalledTimes(2);
    expect(markLiveChannelsChecked).toHaveBeenCalledTimes(1);
  });

  it("rechecks upcoming rows of channels with live turned off alongside the due live channels", async () => {
    mockLiveRowsQuery([
      { channel_id: "A", enabled_live: true },
      { channel_id: "B", enabled_live: false },
    ]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["A"]);
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: [], attemptedChannelIds: ["A"], failedChannels: 0 });
    vi.mocked(findVideoIdsToClassify).mockResolvedValue([]);
    vi.mocked(findUpcomingVideoIds).mockResolvedValue(["up1"]);
    vi.mocked(classifyVideos).mockResolvedValue(1);

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(getDueLiveChannels).toHaveBeenCalledWith(["A"], env.YOUTUBE_LIVE_CACHE_TTL_MINUTES);
    expect(fetchRssIdsForChannels).toHaveBeenCalledWith(["A"]);
    expect(findUpcomingVideoIds).toHaveBeenCalledWith(["B"], 100);
    expect(markLiveChannelsChecked).toHaveBeenCalledWith(["A"]);
  });

  it("caps the upcoming recheck at 100 ids and classifies them ahead of the due ids", async () => {
    const upcoming = Array.from({ length: 100 }, (_, i) => `up${i}`);
    mockLiveRowsQuery([
      { channel_id: "A", enabled_live: true },
      { channel_id: "B", enabled_live: false },
    ]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["A"]);
    vi.mocked(findUpcomingVideoIds).mockResolvedValue(upcoming);
    vi.mocked(findVideoIdsToClassify).mockResolvedValue(["d1"]);
    vi.mocked(classifyVideos).mockResolvedValue(101);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(findUpcomingVideoIds).toHaveBeenCalledWith(["B"], 100);
    expect(findVideoIdsToClassify).toHaveBeenCalledWith(["A"], [], 900);
    expect(classifyVideos).toHaveBeenCalledWith(expect.objectContaining({
      videoIds: [...upcoming, "d1"],
    }));
  });

  it("does not recheck upcoming rows when every channel has live turned on", async () => {
    mockLiveChannelsQuery(["chan1", "chan2"]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["chan1", "chan2"]);
    vi.mocked(fetchRssIdsForChannels).mockResolvedValue({ videoIds: [], attemptedChannelIds: ["chan1", "chan2"], failedChannels: 0 });
    vi.mocked(findVideoIdsToClassify).mockResolvedValue([]);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(findUpcomingVideoIds).not.toHaveBeenCalled();
  });

  it("reduces the classify limit by the upcoming count and classifies upcoming ids first", async () => {
    mockLiveRowsQuery([
      { channel_id: "A", enabled_live: true },
      { channel_id: "B", enabled_live: false },
    ]);
    vi.mocked(getDueLiveChannels).mockResolvedValue(["A"]);
    vi.mocked(findUpcomingVideoIds).mockResolvedValue(["u1", "u2", "u3"]);
    vi.mocked(findVideoIdsToClassify).mockResolvedValue(["d1"]);
    vi.mocked(classifyVideos).mockResolvedValue(4);

    await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(findVideoIdsToClassify).toHaveBeenCalledWith(["A"], [], 997);
    expect(classifyVideos).toHaveBeenCalledWith(expect.objectContaining({
      videoIds: ["u1", "u2", "u3", "d1"],
    }));
  });

  it("rechecks only upcoming ids for channels with live turned off without the due path or rss pass", async () => {
    mockLiveRowsQuery([{ channel_id: "B", enabled_live: false }]);
    vi.mocked(findUpcomingVideoIds).mockResolvedValue(["u1", "u2"]);
    vi.mocked(classifyVideos).mockResolvedValue(2);

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, refreshPaused: false, checkedChannels: 0, rssAttemptedChannels: 0, rssFailedChannels: 0, classifiedVideos: 2 });
    expect(getDueLiveChannels).not.toHaveBeenCalled();
    expect(fetchRssIdsForChannels).not.toHaveBeenCalled();
    expect(findVideoIdsToClassify).not.toHaveBeenCalled();
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(classifyVideos).toHaveBeenCalledWith({
      accessToken: "fake-access-token",
      videoIds: ["u1", "u2"],
      quotaContext: {
        action: "refresh-live",
        userId: "test-user-id",
        requestGroupId: expect.any(String),
      },
    });
  });

  it("fetches no token and classifies nothing when channels with live turned off have no upcoming ids", async () => {
    mockLiveRowsQuery([{ channel_id: "B", enabled_live: false }]);
    vi.mocked(findUpcomingVideoIds).mockResolvedValue([]);

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, refreshPaused: false, checkedChannels: 0, rssAttemptedChannels: 0, rssFailedChannels: 0, classifiedVideos: 0 });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(classifyVideos).not.toHaveBeenCalled();
  });

  it("calls no live helper when the user has no subscription rows", async () => {
    mockLiveRowsQuery([]);

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, refreshPaused: false, checkedChannels: 0, rssAttemptedChannels: 0, rssFailedChannels: 0, classifiedVideos: 0 });
    expect(getDueLiveChannels).not.toHaveBeenCalled();
    expect(findUpcomingVideoIds).not.toHaveBeenCalled();
    expect(fetchRssIdsForChannels).not.toHaveBeenCalled();
    expect(findVideoIdsToClassify).not.toHaveBeenCalled();
  });

  it("responds 500 and does not mark channels checked when upcoming-only classification throws", async () => {
    mockLiveRowsQuery([{ channel_id: "B", enabled_live: false }]);
    vi.mocked(findUpcomingVideoIds).mockResolvedValue(["u1"]);
    vi.mocked(classifyVideos).mockRejectedValue(new Error("YouTube video details fetch failed: 500 boom"));

    const res = await request(buildApp())
      .post("/api/youtube/refresh-live")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(500);
    expect(markLiveChannelsChecked).not.toHaveBeenCalled();
  });
});
