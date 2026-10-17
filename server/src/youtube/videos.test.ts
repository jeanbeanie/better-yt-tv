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
  parseIsoDuration,
  hydrateVideoDetails,
  findVideoIdsToHydrate,
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

describe("parseIsoDuration", () => {
  it("parses minutes and seconds", () => {
    expect(parseIsoDuration("PT4M13S")).toBe(253);
  });

  it("parses hours alone", () => {
    expect(parseIsoDuration("PT1H")).toBe(3600);
  });

  it("parses hours, minutes, and seconds together", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
  });

  it("parses a day component", () => {
    expect(parseIsoDuration("P1DT2H")).toBe(93600);
  });

  it("parses the zero duration live and upcoming videos report", () => {
    expect(parseIsoDuration("P0D")).toBe(0);
  });

  it("returns null for undefined and empty input", () => {
    expect(parseIsoDuration(undefined)).toBeNull();
    expect(parseIsoDuration("")).toBeNull();
  });

  it("returns null for anything that isn't a duration", () => {
    expect(parseIsoDuration("garbage")).toBeNull();
    expect(parseIsoDuration("4:13")).toBeNull();
  });

  it("returns null for a duration with no components", () => {
    expect(parseIsoDuration("P")).toBeNull();
    expect(parseIsoDuration("PT")).toBeNull();
  });
});

function videoItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    snippet: {
      channelId: "chan1",
      title: `title ${id}`,
      publishedAt: "2026-01-01T00:00:00Z",
      liveBroadcastContent: "none",
      thumbnails: { medium: { url: `https://img.example/${id}.jpg` } },
    },
    contentDetails: { duration: "PT4M13S" },
    ...overrides,
  };
}

// echoes an item for every requested id, build returns null to leave one out
function mockVideosListFetch(
  opts: { status?: number; build?: (id: string) => object | null } = {},
) {
  global.fetch = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));

    if (!url.pathname.endsWith("/youtube/v3/videos")) {
      throw new Error(`Unexpected fetch in mockVideosListFetch: ${url}`);
    }

    if (opts.status && opts.status !== 200) {
      return new Response("nope", { status: opts.status });
    }

    const ids = (url.searchParams.get("id") ?? "").split(",");
    const items = ids.map(opts.build ?? ((id) => videoItem(id))).filter(Boolean);
    return new Response(JSON.stringify({ items }), { status: 200 });
  }) as unknown as typeof fetch;
}

function requestedIds(callIndex: number): string[] {
  const [input] = vi.mocked(global.fetch).mock.calls[callIndex];
  return (new URL(String(input)).searchParams.get("id") ?? "").split(",");
}

function queriesContaining(fragment: string) {
  return mockedQuery(vi.mocked(pool.query)).mock.calls.filter(([sql]) =>
    sql.includes(fragment),
  );
}

describe("hydrateVideoDetails", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(recordQuotaUsage).mockReset();
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({ rows: [] }));
  });

  it("splits 120 ids into 3 videos.list calls of at most 50, one quota unit each", async () => {
    mockVideosListFetch();
    const ids = Array.from({ length: 120 }, (_, i) => `v${i}`);

    const hydrated = await hydrateVideoDetails({ accessToken: "token", videoIds: ids });

    expect(hydrated).toBe(120);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(requestedIds(0)).toHaveLength(50);
    expect(requestedIds(1)).toHaveLength(50);
    expect(requestedIds(2)).toHaveLength(20);
    expect(recordQuotaUsage).toHaveBeenCalledTimes(3);
    expect(recordQuotaUsage).toHaveBeenCalledWith("videos.list", 1, {});
  });

  it("passes the quota context through to every call", async () => {
    mockVideosListFetch();
    const quotaContext = { action: "refresh-all-cache:auto", userId: "u1", requestGroupId: "g1" };

    await hydrateVideoDetails({ accessToken: "token", videoIds: ["a"], quotaContext });

    expect(recordQuotaUsage).toHaveBeenCalledWith("videos.list", 1, quotaContext);
  });

  it("saves each batch with one upsert query, not one per video", async () => {
    mockVideosListFetch();
    const ids = Array.from({ length: 120 }, (_, i) => `v${i}`);

    await hydrateVideoDetails({ accessToken: "token", videoIds: ids });

    expect(queriesContaining("insert into videos_cache")).toHaveLength(3);
  });

  it("passes ten parallel arrays in the same order as the insert column list", async () => {
    mockVideosListFetch({
      build: (id) =>
        videoItem(id, {
          snippet: {
            channelId: "chanX",
            title: `title ${id}`,
            publishedAt: "2026-02-03T04:05:06Z",
            liveBroadcastContent: "upcoming",
            thumbnails: {},
          },
          liveStreamingDetails: {
            scheduledStartTime: "2026-03-01T10:00:00Z",
            actualStartTime: "2026-03-01T10:05:00Z",
            actualEndTime: "2026-03-01T12:00:00Z",
          },
        }),
    });

    await hydrateVideoDetails({ accessToken: "token", videoIds: ["a", "b"] });

    const [sql, params] = queriesContaining("insert into videos_cache")[0];
    expect(params).toHaveLength(10);
    for (const column of params as unknown[][]) {
      expect(column).toHaveLength(2);
    }

    // sql columns in order, so each array lines up with its column
    const columns = [
      "video_id",
      "channel_id",
      "title",
      "published_at",
      "thumb_url",
      "duration_seconds",
      "live_broadcast_content",
      "scheduled_start_time",
      "actual_start_time",
      "actual_end_time",
    ];
    const insertList = sql.slice(sql.indexOf("insert into videos_cache"), sql.indexOf(")"));
    const positions = columns.map((column) => insertList.indexOf(column));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((position) => position >= 0)).toBe(true);

    expect(params).toEqual([
      ["a", "b"],
      ["chanX", "chanX"],
      ["title a", "title b"],
      [new Date("2026-02-03T04:05:06Z"), new Date("2026-02-03T04:05:06Z")],
      [null, null],
      [null, null],
      ["upcoming", "upcoming"],
      ["2026-03-01T10:00:00Z", "2026-03-01T10:00:00Z"],
      ["2026-03-01T10:05:00Z", "2026-03-01T10:05:00Z"],
      ["2026-03-01T12:00:00Z", "2026-03-01T12:00:00Z"],
    ]);
  });

  it("parses duration for a normal video", async () => {
    mockVideosListFetch();

    await hydrateVideoDetails({ accessToken: "token", videoIds: ["a"] });

    const [, params] = queriesContaining("insert into videos_cache")[0];
    expect((params as unknown[][])[5]).toEqual([253]);
    expect((params as unknown[][])[6]).toEqual(["none"]);
  });

  it("stores a null duration for a live video reporting P0D", async () => {
    mockVideosListFetch({
      build: (id) =>
        videoItem(id, {
          snippet: {
            channelId: "chan1",
            title: "live now",
            publishedAt: "2026-01-01T00:00:00Z",
            liveBroadcastContent: "live",
          },
          contentDetails: { duration: "P0D" },
        }),
    });

    await hydrateVideoDetails({ accessToken: "token", videoIds: ["a"] });

    const [, params] = queriesContaining("insert into videos_cache")[0];
    expect((params as unknown[][])[5]).toEqual([null]);
    expect((params as unknown[][])[6]).toEqual(["live"]);
  });

  it("marks ids videos.list left out as none so they stop being rechecked", async () => {
    mockVideosListFetch({ build: (id) => (id === "gone" ? null : videoItem(id)) });

    const hydrated = await hydrateVideoDetails({
      accessToken: "token",
      videoIds: ["a", "gone", "b"],
    });

    expect(hydrated).toBe(2);
    const updates = queriesContaining("update videos_cache");
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toEqual([["gone"]]);
  });

  it("treats an item missing a required field as left out", async () => {
    mockVideosListFetch({
      build: (id) =>
        id === "broken"
          ? { id, snippet: { channelId: "chan1", publishedAt: "2026-01-01T00:00:00Z" } }
          : videoItem(id),
    });

    await hydrateVideoDetails({ accessToken: "token", videoIds: ["a", "broken"] });

    expect(queriesContaining("update videos_cache")[0][1]).toEqual([["broken"]]);
  });

  it("sends a repeated id once", async () => {
    mockVideosListFetch();

    await hydrateVideoDetails({ accessToken: "token", videoIds: ["a", "a", "b"] });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(requestedIds(0)).toEqual(["a", "b"]);
  });

  it("makes no calls and returns 0 for an empty list", async () => {
    mockVideosListFetch();

    const hydrated = await hydrateVideoDetails({ accessToken: "token", videoIds: [] });

    expect(hydrated).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(recordQuotaUsage).not.toHaveBeenCalled();
  });

  it("still records videos.list usage when the fetch fails, then rejects", async () => {
    mockVideosListFetch({ status: 500 });

    await expect(
      hydrateVideoDetails({ accessToken: "token", videoIds: ["a"] }),
    ).rejects.toThrow("YouTube video details fetch failed: 500");

    expect(recordQuotaUsage).toHaveBeenCalledWith("videos.list", 1, {});
    expect(queriesContaining("insert into videos_cache")).toHaveLength(0);
  });

  it("keeps batches saved before a later batch fails", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `v${i}`);
    let calls = 0;
    global.fetch = vi.fn(async (input: string | URL) => {
      calls += 1;
      if (calls === 2) return new Response("nope", { status: 500 });
      const requested = (new URL(String(input)).searchParams.get("id") ?? "").split(",");
      return new Response(JSON.stringify({ items: requested.map((id) => videoItem(id)) }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    await expect(
      hydrateVideoDetails({ accessToken: "token", videoIds: ids }),
    ).rejects.toThrow();

    expect(queriesContaining("insert into videos_cache")).toHaveLength(1);
  });
});

describe("findVideoIdsToHydrate", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("returns an empty list without querying when there are no channels", async () => {
    const result = await findVideoIdsToHydrate([], 100);

    expect(result).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("passes the channels, the cache ttl, and the limit, and returns the ids", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [{ video_id: "v1" }, { video_id: "v2" }] }),
    );

    const result = await findVideoIdsToHydrate(["chan1", "chan2"], 2000);

    expect(result).toEqual(["v1", "v2"]);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(String(sql)).toContain("order by published_at desc");
    expect(params).toEqual([["chan1", "chan2"], expect.any(Number), 2000]);
  });
});
