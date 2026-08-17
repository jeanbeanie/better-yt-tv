import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

const { pool } = await import("../db/pool.js");
const {
  fetchRecentVideosForChannel,
  getChannelCacheState,
  markChannelCacheRefreshed,
} = await import("./videos.js");

function mockYoutubeFetch() {
  global.fetch = vi.fn(async (input: any) => {
    const url = String(input);

    if (url.includes("/youtube/v3/channels")) {
      return new Response(
        JSON.stringify({
          items: [
            { contentDetails: { relatedPlaylists: { uploads: "UUresolved" } } },
          ],
        }),
        { status: 200 },
      );
    }

    if (url.includes("/youtube/v3/playlistItems")) {
      return new Response(
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
      );
    }

    throw new Error(`Unexpected fetch in mockYoutubeFetch: ${url}`);
  }) as unknown as typeof fetch;
}

describe("fetchRecentVideosForChannel", () => {
  beforeEach(() => {
    mockYoutubeFetch();
  });

  it("resolves the uploads playlist id when none is cached", async () => {
    const result = await fetchRecentVideosForChannel({
      accessToken: "token",
      channelId: "chan1",
    });

    expect(result.uploadsPlaylistId).toBe("UUresolved");
    expect(result.videos).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(global.fetch).mock.calls[0][0])).toContain("/youtube/v3/channels");
    expect(String(vi.mocked(global.fetch).mock.calls[1][0])).toContain("/youtube/v3/playlistItems");
  });

  it("skips the channels lookup when a cached uploads playlist id is passed in", async () => {
    const result = await fetchRecentVideosForChannel({
      accessToken: "token",
      channelId: "chan1",
      cachedUploadsPlaylistId: "UUcached",
    });

    expect(result.uploadsPlaylistId).toBe("UUcached");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(global.fetch).mock.calls[0][0])).toContain("/youtube/v3/playlistItems");
  });
});

describe("getChannelCacheState", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("treats a missing row as stale with no cached id", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);

    const result = await getChannelCacheState("chan1");

    expect(result).toEqual({ stale: true, uploadsPlaylistId: null });
  });

  it("reports stale when cache_expires_at is in the past, but still returns the cached id", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ cache_expires_at: new Date(Date.now() - 1000), uploads_playlist_id: "UUold" }],
      rowCount: 1,
    } as any);

    const result = await getChannelCacheState("chan1");

    expect(result).toEqual({ stale: true, uploadsPlaylistId: "UUold" });
  });

  it("reports fresh when cache_expires_at is in the future", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ cache_expires_at: new Date(Date.now() + 60_000), uploads_playlist_id: "UUfresh" }],
      rowCount: 1,
    } as any);

    const result = await getChannelCacheState("chan1");

    expect(result).toEqual({ stale: false, uploadsPlaylistId: "UUfresh" });
  });
});

describe("markChannelCacheRefreshed", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("persists the uploads playlist id alongside the expiry timestamp", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

    await markChannelCacheRefreshed("chan1", "UUresolved");

    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(String(sql)).toContain("uploads_playlist_id");
    expect(params).toEqual(["chan1", expect.any(Date), "UUresolved"]);
  });
});
