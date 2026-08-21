import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB pool so no real Postgres connection is needed
vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

// Bypass real session lookup -- attach a fake userId like requireAuth would
vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = "test-user-id";
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

const { pool } = await import("../db/pool.js");
const { recordQuotaUsage } = await import("../youtube/quota.js");
const {
  getChannelCacheState,
  fetchRecentVideosForChannel,
  upsertVideosCache,
  markChannelCacheRefreshed,
} = await import("../youtube/videos.js");
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
  global.fetch = vi.fn(async (url: any) => {
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
// what the sync insert itself does -- stub that lookup so tests can focus
// on the subscriptions/preferences insert in isolation.
function mockOauthTokenLookup(onSyncInsert: (params: any[]) => any) {
  vi.mocked(pool.query).mockImplementation(async (sql: any, params: any) => {
    if (String(sql).includes("oauth_tokens")) {
      return { rows: [{ refresh_token_ciphertext: "fake-ciphertext" }], rowCount: 1 } as any;
    }
    return onSyncInsert(params);
  });
}

function syncInsertCalls() {
  return vi
    .mocked(pool.query)
    .mock.calls.filter(([sql]) => String(sql).includes("with subs as"));
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
    mockOauthTokenLookup(async () => ({ rows: [], rowCount: 0 }));

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
    mockOauthTokenLookup(async () => ({ rows: [], rowCount: 0 }));

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
    mockOauthTokenLookup(async () => ({ rows: [], rowCount: 0 }));
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
    mockOauthTokenLookup(async () => ({ rows: [], rowCount: 0 }));
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
  vi.mocked(pool.query).mockImplementation(async (sql: any) => {
    if (String(sql).includes("oauth_tokens")) {
      return { rows: [{ refresh_token_ciphertext: "fake-ciphertext" }], rowCount: 1 } as any;
    }
    if (String(sql).includes("from user_subscriptions us")) {
      return {
        rows: channelIds.map((channel_id) => ({ channel_id })),
        rowCount: channelIds.length,
      } as any;
    }
    throw new Error(`Unexpected query in mockChannelIdsQuery: ${String(sql)}`);
  });
}

describe("POST /api/youtube/refresh-all-cache", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(getChannelCacheState).mockReset();
    vi.mocked(fetchRecentVideosForChannel).mockReset();
    vi.mocked(upsertVideosCache).mockReset();
    vi.mocked(markChannelCacheRefreshed).mockReset();
  });

  // pool.query is mocked, so this can't prove the WHERE clause actually
  // filters correctly against real data -- it guards the query's shape,
  // so a future edit can't silently drop the list_channels override or
  // reintroduce enabled_live (see the comment above this query in
  // youtube.ts for why enabled_live is deliberately excluded)
  it("queries channel eligibility via channel_preferences and list_channels, never enabled_live", async () => {
    mockChannelIdsQuery([]);

    await request(buildApp())
      .post("/api/youtube/refresh-all-cache")
      .set("Cookie", "sid=fake-session");

    const call = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) => String(sql).includes("from user_subscriptions us"));
    expect(call).toBeDefined();
    const sql = String(call![0]);
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
      refreshedChannels: 0,
      skippedChannels: 0,
      failedChannels: 0,
      cachedVideos: 0,
    });
    expect(getChannelCacheState).not.toHaveBeenCalled();
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
      action: "refresh-all-cache",
      userId: "test-user-id",
      requestGroupId: expect.any(String),
    });
    expect(secondCallArgs.quotaContext?.requestGroupId).toBe(firstCallArgs.quotaContext?.requestGroupId);
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
