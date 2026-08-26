import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPool, mockedQuery, mockQueryResult } from "../testUtils/pgMocks.js";

vi.mock("../db/pool.js", () => ({
  pool: createMockPool(),
}));

vi.mock("./quota.js", () => ({
  recordQuotaUsage: vi.fn(),
}));

const { pool } = await import("../db/pool.js");
const { recordQuotaUsage } = await import("./quota.js");
const {
  fetchRecentVideosForChannel,
  getChannelCacheState,
  markChannelCacheRefreshed,
} = await import("./videos.js");

function mockChannelAndPlaylistFetch(
  opts: { channelStatus?: number; playlistStatus?: number } = {},
) {
  const channelStatus = opts.channelStatus ?? 200;
  const playlistStatus = opts.playlistStatus ?? 200;

  global.fetch = vi.fn(async (input: string | URL) => {
    const url = String(input);

    if (url.includes("/youtube/v3/channels")) {
      return channelStatus === 200
        ? new Response(
            JSON.stringify({
              items: [{ contentDetails: { relatedPlaylists: { uploads: "UUresolved" } } }],
            }),
            { status: 200 },
          )
        : new Response("nope", { status: channelStatus });
    }

    if (url.includes("/youtube/v3/playlistItems")) {
      return playlistStatus === 200
        ? new Response(
            JSON.stringify({
              items: [
                {
                  snippet: {
                    resourceId: { videoId: "v1" },
                    channelId: "chan1",
                    title: "t",
                    publishedAt: "2026-01-01T00:00:00Z",
                    thumbnails: {},
                  },
                },
              ],
            }),
            { status: 200 },
          )
        : new Response("nope", { status: playlistStatus });
    }

    throw new Error(`Unexpected fetch in mockChannelAndPlaylistFetch: ${url}`);
  }) as unknown as typeof fetch;
}

describe("fetchRecentVideosForChannel", () => {
  beforeEach(() => {
    vi.mocked(recordQuotaUsage).mockReset();
  });

  it("resolves the uploads playlist id when none is cached", async () => {
    mockChannelAndPlaylistFetch();

    const result = await fetchRecentVideosForChannel({
      accessToken: "token",
      channelId: "chan1",
    });

    expect(result.uploadsPlaylistId).toBe("UUresolved");
    expect(result.videos).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(recordQuotaUsage).toHaveBeenCalledWith("channels.list", 1, {});
    expect(recordQuotaUsage).toHaveBeenCalledWith("playlistItems.list", 1, {});
    expect(recordQuotaUsage).toHaveBeenCalledTimes(2);
  });

  it("skips the channels lookup when a cached uploads playlist id is passed in", async () => {
    mockChannelAndPlaylistFetch();

    const result = await fetchRecentVideosForChannel({
      accessToken: "token",
      channelId: "chan1",
      cachedUploadsPlaylistId: "UUcached",
    });

    expect(result.uploadsPlaylistId).toBe("UUcached");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(recordQuotaUsage).not.toHaveBeenCalledWith("channels.list", 1, {});
    expect(recordQuotaUsage).toHaveBeenCalledWith("playlistItems.list", 1, {});
    expect(recordQuotaUsage).toHaveBeenCalledTimes(1);
  });

  it("still records channels.list usage when the channel lookup fails", async () => {
    mockChannelAndPlaylistFetch({ channelStatus: 403 });

    await expect(
      fetchRecentVideosForChannel({ accessToken: "token", channelId: "chan1" }),
    ).rejects.toThrow();

    expect(recordQuotaUsage).toHaveBeenCalledWith("channels.list", 1, {});
    expect(recordQuotaUsage).not.toHaveBeenCalledWith("playlistItems.list", 1, {});
  });

  it("still records playlistItems.list usage when the playlist fetch fails", async () => {
    mockChannelAndPlaylistFetch({ playlistStatus: 500 });

    await expect(
      fetchRecentVideosForChannel({ accessToken: "token", channelId: "chan1" }),
    ).rejects.toThrow();

    expect(recordQuotaUsage).toHaveBeenCalledWith("channels.list", 1, {});
    expect(recordQuotaUsage).toHaveBeenCalledWith("playlistItems.list", 1, {});
  });
});

describe("getChannelCacheState", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("treats a missing row as stale with no cached id", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [], rowCount: 0 }),
    );

    const result = await getChannelCacheState("chan1");

    expect(result).toEqual({ stale: true, uploadsPlaylistId: null });
  });

  it("reports stale when cache_expires_at is in the past, but still returns the cached id", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({
      rows: [{ cache_expires_at: new Date(Date.now() - 1000), uploads_playlist_id: "UUold" }],
      rowCount: 1,
    }));

    const result = await getChannelCacheState("chan1");

    expect(result).toEqual({ stale: true, uploadsPlaylistId: "UUold" });
  });

  it("reports fresh when cache_expires_at is in the future", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({
      rows: [{ cache_expires_at: new Date(Date.now() + 60_000), uploads_playlist_id: "UUfresh" }],
      rowCount: 1,
    }));

    const result = await getChannelCacheState("chan1");

    expect(result).toEqual({ stale: false, uploadsPlaylistId: "UUfresh" });
  });
});

describe("markChannelCacheRefreshed", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("persists the uploads playlist id alongside the expiry timestamp", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({ rows: [] }));

    await markChannelCacheRefreshed("chan1", "UUresolved");

    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(String(sql)).toContain("uploads_playlist_id");
    expect(params).toEqual(["chan1", expect.any(Date), "UUresolved"]);
  });

  it("accepts a null playlist id, for a channel that never resolved one", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({ rows: [] }));

    await markChannelCacheRefreshed("chan1", null);

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toEqual(["chan1", expect.any(Date), null]);
  });
});
