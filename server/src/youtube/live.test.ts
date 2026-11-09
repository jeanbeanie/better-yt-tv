import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { createMockPool, mockedQuery, mockQueryResult } from "../testUtils/pgMocks.js";
import type { YoutubeVideo } from "./apiTypes.js";

vi.mock("../db/pool.js", () => ({
  pool: createMockPool(),
}));

vi.mock("./quota.js", () => ({
  recordQuotaUsage: vi.fn(),
}));

const { pool } = await import("../db/pool.js");
const { recordQuotaUsage } = await import("./quota.js");
const { fetchChannelRssVideoIds, fetchRssIdsForChannels, classifyVideos, findVideoIdsToClassify, findUpcomingVideoIds, getDueLiveChannels, markLiveChannelsChecked } = await import("./live.js");

const CHANNEL_ID = "UCxxxxxxxxxxxxxxxxxxxxxx";

const FEED_WITH_ENTRIES = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}"/>
  <title>Example Channel</title>
  <yt:channelId>${CHANNEL_ID}</yt:channelId>
  <author>
    <name>Example Channel</name>
    <uri>https://www.youtube.com/channel/${CHANNEL_ID}</uri>
  </author>
  <entry>
    <id>yt:video:aB3_-xY9kLm</id>
    <yt:videoId>aB3_-xY9kLm</yt:videoId>
    <yt:channelId>${CHANNEL_ID}</yt:channelId>
    <title>Newest upload</title>
    <published>2026-11-05T10:00:00+00:00</published>
    <media:group>
      <media:title>Newest upload</media:title>
    </media:group>
  </entry>
  <entry>
    <id>yt:video:Zz0-_AbCdEf</id>
    <yt:videoId>Zz0-_AbCdEf</yt:videoId>
    <yt:channelId>${CHANNEL_ID}</yt:channelId>
    <title>Older upload</title>
    <published>2026-11-01T10:00:00+00:00</published>
  </entry>
  <entry>
    <id>yt:video:Q1w2E3r4T5y</id>
    <yt:videoId>Q1w2E3r4T5y</yt:videoId>
    <yt:channelId>${CHANNEL_ID}</yt:channelId>
    <title>Oldest upload</title>
    <published>2026-10-20T10:00:00+00:00</published>
  </entry>
</feed>`;

const FEED_WITHOUT_ENTRIES = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <title>Empty Channel</title>
  <yt:channelId>${CHANNEL_ID}</yt:channelId>
</feed>`;

describe("fetchChannelRssVideoIds", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("returns video ids in document order and ignores other tags", async () => {
    global.fetch = vi.fn(
      async () => new Response(FEED_WITH_ENTRIES, { status: 200 }),
    ) as unknown as typeof fetch;

    const ids = await fetchChannelRssVideoIds(CHANNEL_ID);

    expect(ids).toEqual(["aB3_-xY9kLm", "Zz0-_AbCdEf", "Q1w2E3r4T5y"]);
    expect(ids).not.toContain(CHANNEL_ID);
  });

  it("returns an empty array for a feed with no entries", async () => {
    global.fetch = vi.fn(
      async () => new Response(FEED_WITHOUT_ENTRIES, { status: 200 }),
    ) as unknown as typeof fetch;

    const ids = await fetchChannelRssVideoIds(CHANNEL_ID);

    expect(ids).toEqual([]);
  });

  it("throws on a non-2xx status without including the response body", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response("<html>upstream outage page marker</html>", { status: 503 }),
    ) as unknown as typeof fetch;

    const err = await fetchChannelRssVideoIds(CHANNEL_ID).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("YouTube RSS fetch failed: 503");
  });

  it("propagates a rejected fetch", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed")) as unknown as typeof fetch;

    await expect(fetchChannelRssVideoIds(CHANNEL_ID)).rejects.toThrow("fetch failed");
  });

  it("requests the RSS url for the given channel id", async () => {
    global.fetch = vi.fn(
      async () => new Response(FEED_WITHOUT_ENTRIES, { status: 200 }),
    ) as unknown as typeof fetch;

    await fetchChannelRssVideoIds(CHANNEL_ID);

    const requested = String(vi.mocked(global.fetch).mock.calls[0][0]);
    expect(requested).toContain("https://www.youtube.com/feeds/videos.xml");
    expect(requested).toContain(`channel_id=${CHANNEL_ID}`);
  });
});

describe("fetchRssIdsForChannels", () => {
  let errorSpy: MockInstance;

  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function channelIdsOf(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `UCchannel${String(i).padStart(2, "0")}`);
  }

  // video ids must match the 11 char pattern in VIDEO_ID_PATTERN
  function videoIdOf(n: number): string {
    return `vid${String(n).padStart(8, "0")}`;
  }

  function rssFeed(ids: string[]): Response {
    const entries = ids.map((id) => `<entry><yt:videoId>${id}</yt:videoId></entry>`).join("");
    return new Response(`<feed>${entries}</feed>`, { status: 200 });
  }

  // a throwing respond becomes a rejected fetch
  function mockFetchByChannel(respond: (channelId: string) => Response | Promise<Response>) {
    global.fetch = vi.fn(async (input: string | URL) =>
      respond(new URL(String(input)).searchParams.get("channel_id") ?? ""),
    ) as unknown as typeof fetch;
  }

  it("returns deduplicated ids across channels and dedupes requested channels", async () => {
    const [c0, c1, c2] = channelIdsOf(3);
    const feeds: Record<string, string[]> = {
      [c0]: [videoIdOf(1), videoIdOf(2)],
      [c1]: [videoIdOf(2), videoIdOf(3)],
      [c2]: [videoIdOf(4)],
    };
    mockFetchByChannel((channelId) => rssFeed(feeds[channelId]));

    const result = await fetchRssIdsForChannels([c0, c1, c2, c0]);

    expect([...result.videoIds].sort()).toEqual([videoIdOf(1), videoIdOf(2), videoIdOf(3), videoIdOf(4)]);
    expect(result.attemptedChannelIds).toEqual([c0, c1, c2]);
    expect(result.failedChannels).toBe(0);
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(3);
  });

  it("counts a failing channel as failed and keeps the other channels ids", async () => {
    const [c0, c1, c2] = channelIdsOf(3);
    const feeds: Record<string, string[]> = {
      [c0]: [videoIdOf(1)],
      [c2]: [videoIdOf(2)],
    };
    mockFetchByChannel((channelId) =>
      channelId === c1 ? new Response("outage", { status: 500 }) : rssFeed(feeds[channelId]),
    );

    const result = await fetchRssIdsForChannels([c0, c1, c2]);

    expect([...result.videoIds].sort()).toEqual([videoIdOf(1), videoIdOf(2)]);
    expect(result.attemptedChannelIds).toEqual([c0, c1, c2]);
    expect(result.failedChannels).toBe(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("never has more than 5 requests in flight", async () => {
    const channels = channelIdsOf(12);
    let inFlight = 0;
    let maxInFlight = 0;
    global.fetch = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return rssFeed([]);
    }) as unknown as typeof fetch;

    const result = await fetchRssIdsForChannels(channels);

    expect(maxInFlight).toBe(5);
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(12);
    expect(result.attemptedChannelIds).toEqual(channels);
    expect(result.failedChannels).toBe(0);
  });

  it("stops after the first group when every channel in it fails", async () => {
    const channels = channelIdsOf(12);
    mockFetchByChannel(() => new Response("outage", { status: 500 }));

    const result = await fetchRssIdsForChannels(channels);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(5);
    expect(result).toEqual({ videoIds: [], attemptedChannelIds: channels.slice(0, 5), failedChannels: 5 });
    expect(errorSpy).toHaveBeenCalledTimes(5);
  });

  it("does not stop on a partially failed group", async () => {
    const channels = channelIdsOf(12);
    const failing = new Set(channels.slice(0, 4));
    mockFetchByChannel((channelId) =>
      failing.has(channelId) ? new Response("outage", { status: 500 }) : rssFeed([videoIdOf(0)]),
    );

    const result = await fetchRssIdsForChannels(channels);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(12);
    expect(result.attemptedChannelIds).toEqual(channels);
    expect(result.failedChannels).toBe(4);
  });

  it("makes no requests for an empty channel list", async () => {
    const result = await fetchRssIdsForChannels([]);

    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
    expect(result).toEqual({ videoIds: [], attemptedChannelIds: [], failedChannels: 0 });
  });

  it("treats a rejected fetch as a failed channel and logs it", async () => {
    const [c0, c1] = channelIdsOf(2);
    mockFetchByChannel((channelId) => {
      if (channelId === c0) throw new TypeError("fetch failed");
      return rssFeed([videoIdOf(1)]);
    });

    const result = await fetchRssIdsForChannels([c0, c1]);

    expect(result).toEqual({ videoIds: [videoIdOf(1)], attemptedChannelIds: [c0, c1], failedChannels: 1 });
    expect(errorSpy).toHaveBeenCalledWith(`Failed to fetch RSS for channel ${c0}:`, expect.any(TypeError));
  });

  it("stops starting new groups once the time budget is spent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-08T00:00:00Z"));
      const channels = channelIdsOf(20);
      let calls = 0;
      global.fetch = vi.fn(async () => {
        // each group takes 20 seconds, advanced on its first request
        if (calls++ % 5 === 0) vi.setSystemTime(Date.now() + 20_000);
        return rssFeed([]);
      }) as unknown as typeof fetch;

      const result = await fetchRssIdsForChannels(channels, 45_000);

      expect(result.attemptedChannelIds).toEqual(channels.slice(0, 15));
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(15);
    } finally {
      vi.useRealTimers();
    }
  });

  it("always runs the first group even with no budget", async () => {
    const channels = channelIdsOf(12);
    mockFetchByChannel(() => rssFeed([]));

    const result = await fetchRssIdsForChannels(channels, 0);

    expect(result.attemptedChannelIds).toEqual(channels.slice(0, 5));
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(5);
  });
});

const QUOTA_CONTEXT = { action: "refresh-live", requestGroupId: "group-1" };
const PUBLISHED_AT = "2026-11-01T10:00:00Z";

function idsOf(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `vid${i}`);
}

function idsFromUrl(input: string | URL): string[] {
  return (new URL(String(input)).searchParams.get("id") ?? "").split(",");
}

function validItem(id: string): YoutubeVideo {
  return {
    id,
    snippet: {
      channelId: "UCchan",
      title: `title ${id}`,
      publishedAt: PUBLISHED_AT,
      liveBroadcastContent: "none",
      thumbnails: { medium: { url: `https://img.example/${id}.jpg` } },
    },
  };
}

function jsonResponse(items: YoutubeVideo[]): Response {
  return new Response(JSON.stringify({ items }), { status: 200 });
}

function mockVideosFetch(respond: (ids: string[]) => Response) {
  const fetchMock = vi.fn(async (input: string | URL) => respond(idsFromUrl(input)));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// retire updates also go through pool.query, so tests pick calls by sql
function insertCalls() {
  return mockedQuery(vi.mocked(pool.query)).mock.calls.filter(([sql]) =>
    String(sql).includes("insert into videos_cache"),
  );
}

function updateCalls() {
  return mockedQuery(vi.mocked(pool.query)).mock.calls.filter(([sql]) =>
    String(sql).includes("update videos_cache"),
  );
}

describe("classifyVideos", () => {
  beforeEach(() => {
    vi.mocked(recordQuotaUsage).mockReset();
    vi.mocked(pool.query).mockReset();
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult());
  });

  it("batches 120 ids into calls of 50, 50 and 20 and saves one row per id", async () => {
    const ids = idsOf(120);
    const fetchMock = mockVideosFetch((requested) => jsonResponse(requested.map(validItem)));

    const saved = await classifyVideos({
      accessToken: "token",
      videoIds: ids,
      quotaContext: QUOTA_CONTEXT,
    });

    expect(fetchMock.mock.calls.map(([input]) => idsFromUrl(input))).toEqual([
      ids.slice(0, 50),
      ids.slice(50, 100),
      ids.slice(100),
    ]);
    expect(recordQuotaUsage).toHaveBeenCalledTimes(3);
    expect(recordQuotaUsage).toHaveBeenCalledWith("videos.list", 1, QUOTA_CONTEXT);
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(saved).toBe(120);
  });

  it("records quota when the response is not ok and throws with the status", async () => {
    mockVideosFetch(() => new Response("quota exceeded", { status: 403 }));

    await expect(
      classifyVideos({ accessToken: "token", videoIds: ["vid1"], quotaContext: QUOTA_CONTEXT }),
    ).rejects.toThrow("YouTube video details fetch failed: 403 quota exceeded");

    expect(recordQuotaUsage).toHaveBeenCalledWith("videos.list", 1, QUOTA_CONTEXT);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("keeps the upsert of an earlier batch when a later batch fails", async () => {
    mockVideosFetch((requested) =>
      requested.includes("vid50")
        ? new Response("boom", { status: 500 })
        : jsonResponse(requested.map(validItem)),
    );

    await expect(
      classifyVideos({ accessToken: "token", videoIds: idsOf(100) }),
    ).rejects.toThrow("YouTube video details fetch failed: 500");

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toContainEqual(idsOf(50));
  });

  it("sends duplicate ids once", async () => {
    const fetchMock = mockVideosFetch((requested) => jsonResponse(requested.map(validItem)));

    const saved = await classifyVideos({
      accessToken: "token",
      videoIds: ["a", "b", "a", "c", "b"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(idsFromUrl(fetchMock.mock.calls[0][0])).toEqual(["a", "b", "c"]);
    expect(saved).toBe(3);
  });

  it("returns 0 without fetching or querying for an empty id list", async () => {
    const fetchMock = mockVideosFetch(() => jsonResponse([]));

    const saved = await classifyVideos({ accessToken: "token", videoIds: [] });

    expect(saved).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordQuotaUsage).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("only updates the live columns on conflict", async () => {
    mockVideosFetch((requested) => jsonResponse(requested.map(validItem)));

    await classifyVideos({ accessToken: "token", videoIds: ["vid1"] });

    const [sql] = vi.mocked(pool.query).mock.calls[0];
    const parts = String(sql).split("on conflict");
    expect(parts).toHaveLength(2);
    const conflictClause = parts[1];
    for (const column of [
      "live_broadcast_content",
      "scheduled_start_time",
      "actual_start_time",
    ]) {
      expect(conflictClause).toContain(column);
    }
    for (const column of ["published_at", "title", "thumb_url", "fetched_at"]) {
      expect(conflictClause).not.toContain(column);
    }
  });

  it("maps live, upcoming and unclassified items into upsert params", async () => {
    const items: YoutubeVideo[] = [
      {
        id: "liveA",
        snippet: {
          channelId: "UCchan",
          title: "t liveA",
          publishedAt: "2026-11-01T10:00:00Z",
          liveBroadcastContent: "live",
          thumbnails: {
            medium: { url: "https://img/liveA-m" },
            default: { url: "https://img/liveA-d" },
          },
        },
        liveStreamingDetails: { actualStartTime: "2026-11-06T12:00:00Z" },
      },
      {
        id: "upc",
        snippet: {
          channelId: "UCchan",
          title: "t upc",
          publishedAt: "2026-11-02T10:00:00Z",
          liveBroadcastContent: "upcoming",
          thumbnails: { default: { url: "https://img/upc-d" } },
        },
        liveStreamingDetails: { scheduledStartTime: "2026-11-07T18:00:00Z" },
      },
      {
        id: "none1",
        snippet: {
          channelId: "UCchan",
          title: "t none1",
          publishedAt: "2026-11-03T10:00:00Z",
        },
      },
      {
        id: "unk",
        snippet: {
          channelId: "UCchan",
          title: "t unk",
          publishedAt: "2026-11-04T10:00:00Z",
          liveBroadcastContent: "weird",
          thumbnails: {},
        },
      },
    ];
    mockVideosFetch(() => jsonResponse(items));

    await classifyVideos({ accessToken: "token", videoIds: items.map((item) => item.id ?? "") });

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toEqual([
      ["liveA", "upc", "none1", "unk"],
      ["UCchan", "UCchan", "UCchan", "UCchan"],
      ["t liveA", "t upc", "t none1", "t unk"],
      [
        new Date("2026-11-01T10:00:00Z"),
        new Date("2026-11-02T10:00:00Z"),
        new Date("2026-11-03T10:00:00Z"),
        new Date("2026-11-04T10:00:00Z"),
      ],
      ["https://img/liveA-m", "https://img/upc-d", null, null],
      ["live", "upcoming", "none", "none"],
      [null, new Date("2026-11-07T18:00:00Z"), null, null],
      [new Date("2026-11-06T12:00:00Z"), null, null, null],
    ]);
  });

  it("skips items missing id, channelId, title or publishedAt", async () => {
    mockVideosFetch(() =>
      jsonResponse([
        validItem("ok1"),
        { id: "noTitle", snippet: { channelId: "UCchan", publishedAt: PUBLISHED_AT } },
        { id: "noChannel", snippet: { title: "t", publishedAt: PUBLISHED_AT } },
        { id: "noPublished", snippet: { channelId: "UCchan", title: "t" } },
        { snippet: { channelId: "UCchan", title: "t", publishedAt: PUBLISHED_AT } },
      ]),
    );

    const saved = await classifyVideos({
      accessToken: "token",
      videoIds: ["ok1", "noTitle", "noChannel", "noPublished", "noId"],
    });

    expect(saved).toBe(1);
    const [, params] = insertCalls()[0];
    expect(params).toContainEqual(["ok1"]);
  });

  it("runs no upsert when every item in a batch is invalid", async () => {
    mockVideosFetch(() =>
      jsonResponse([{ id: "noTitle", snippet: { channelId: "UCchan", publishedAt: PUBLISHED_AT } }]),
    );

    const saved = await classifyVideos({ accessToken: "token", videoIds: ["noTitle"] });

    expect(saved).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("does not write ids the API did not return", async () => {
    mockVideosFetch(() => jsonResponse([validItem("a")]));

    const saved = await classifyVideos({ accessToken: "token", videoIds: ["a", "b", "c"] });

    expect(saved).toBe(1);
    const [, params] = insertCalls()[0];
    expect(params).toContainEqual(["a"]);
  });

  it("skips an item with an unparseable publishedAt and saves the rest", async () => {
    mockVideosFetch(() =>
      jsonResponse([
        validItem("ok1"),
        { id: "badDate", snippet: { channelId: "UCchan", title: "t", publishedAt: "garbage" } },
      ]),
    );

    const saved = await classifyVideos({ accessToken: "token", videoIds: ["ok1", "badDate"] });

    expect(saved).toBe(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toContainEqual(["ok1"]);
  });

  it("saves an item with an unparseable scheduledStartTime with a null scheduled start", async () => {
    mockVideosFetch(() =>
      jsonResponse([{ ...validItem("sched"), liveStreamingDetails: { scheduledStartTime: "garbage" } }]),
    );

    const saved = await classifyVideos({ accessToken: "token", videoIds: ["sched"] });

    expect(saved).toBe(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params[6]).toEqual([null]);
  });

  it("saves a repeated id from one response once", async () => {
    mockVideosFetch(() => jsonResponse([validItem("dup"), validItem("dup")]));

    const saved = await classifyVideos({ accessToken: "token", videoIds: ["dup"] });

    expect(saved).toBe(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toContainEqual(["dup"]);
  });

  it("retires a requested id the response omits and leaves returned ids alone", async () => {
    mockVideosFetch(() => jsonResponse([validItem("a")]));

    const saved = await classifyVideos({ accessToken: "token", videoIds: ["a", "b", "c"] });

    expect(saved).toBe(1);
    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    const [, params] = updates[0];
    expect(params?.[0]).toEqual(["b", "c"]);
  });

  it("runs no retire update when every requested id is returned", async () => {
    mockVideosFetch((requested) => jsonResponse(requested.map(validItem)));

    await classifyVideos({ accessToken: "token", videoIds: ["a", "b"] });

    expect(updateCalls()).toHaveLength(0);
  });

  it("does not retire an id that is returned but skipped as invalid", async () => {
    mockVideosFetch(() =>
      jsonResponse([
        validItem("ok1"),
        { id: "noTitle", snippet: { channelId: "UCchan", publishedAt: PUBLISHED_AT } },
      ]),
    );

    const saved = await classifyVideos({ accessToken: "token", videoIds: ["ok1", "noTitle"] });

    expect(saved).toBe(1);
    expect(updateCalls()).toHaveLength(0);
  });

  it("keeps the retire update from an earlier batch when a later batch fails", async () => {
    mockVideosFetch((requested) =>
      requested.includes("vid50")
        ? new Response("boom", { status: 500 })
        : jsonResponse(requested.filter((id) => id !== "vid0").map(validItem)),
    );

    await expect(
      classifyVideos({ accessToken: "token", videoIds: idsOf(100) }),
    ).rejects.toThrow("YouTube video details fetch failed: 500");

    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    const [, params] = updates[0];
    expect(params?.[0]).toEqual(["vid0"]);
    expect(insertCalls()).toHaveLength(1);
  });

  it.each([
    ["an empty object", {}],
    ["a non-array items value", { items: "nope" }],
  ])("treats a response with %s as no information and does not retire or upsert", async (_label, body) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mockVideosFetch(() => new Response(JSON.stringify(body), { status: 200 }));

      const saved = await classifyVideos({ accessToken: "token", videoIds: ["vid1", "vid2"] });

      expect(saved).toBe(0);
      expect(insertCalls()).toHaveLength(0);
      expect(updateCalls()).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("retires requested ids when videos.list answers with an empty items array", async () => {
    mockVideosFetch(() => jsonResponse([]));

    const saved = await classifyVideos({ accessToken: "token", videoIds: ["vid1", "vid2"] });

    expect(saved).toBe(0);
    expect(insertCalls()).toHaveLength(0);
    expect(updateCalls()).toHaveLength(1);
    expect(updateCalls()[0][1]).toEqual([["vid1", "vid2"]]);
  });

  it("keeps earlier upserts and continues past a batch without an items array", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let batch = 0;
      const fetchMock = mockVideosFetch((requested) => {
        batch++;
        return batch === 2
          ? new Response(JSON.stringify({}), { status: 200 })
          : jsonResponse(requested.map(validItem));
      });

      const saved = await classifyVideos({ accessToken: "token", videoIds: idsOf(150) });

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(saved).toBe(100);
      expect(insertCalls()).toHaveLength(2);
      expect(updateCalls()).toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("findVideoIdsToClassify", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult());
  });

  it("returns [] and runs no query when channelIds and rssIds are empty", async () => {
    const ids = await findVideoIdsToClassify([], [], 10);

    expect(ids).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns [] and runs no query when limit is 0 or negative", async () => {
    expect(await findVideoIdsToClassify(["UCa"], ["v1"], 0)).toEqual([]);
    expect(await findVideoIdsToClassify(["UCa"], ["v1"], -1)).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("dedupes rssIds before the query", async () => {
    await findVideoIdsToClassify(["UCa"], ["v1", "v2", "v1"], 10);

    const params = mockedQuery(vi.mocked(pool.query)).mock.calls[0][1];
    expect(params).toContainEqual(["v1", "v2"]);
  });

  it("still queries when channelIds is empty but rssIds is not", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValueOnce(
      mockQueryResult({ rows: [{ video_id: "v1" }] }),
    );

    const ids = await findVideoIdsToClassify([], ["v1"], 10);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(ids).toEqual(["v1"]);
  });
});

describe("getDueLiveChannels", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult());
  });

  it("returns [] and runs no query for empty input", async () => {
    const ids = await getDueLiveChannels([], 30);

    expect(ids).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("dedupes channelIds and passes the ttl minutes as the second param", async () => {
    await getDueLiveChannels(["UCa", "UCa", "UCb"], 30);

    const params = mockedQuery(vi.mocked(pool.query)).mock.calls[0][1];
    expect(params).toEqual([["UCa", "UCb"], 30]);
  });
});

describe("markLiveChannelsChecked", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult());
  });

  it("runs no query for empty input", async () => {
    await markLiveChannelsChecked([]);

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("dedupes ids before the single query", async () => {
    await markLiveChannelsChecked(["UCa", "UCb", "UCa"]);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const params = mockedQuery(vi.mocked(pool.query)).mock.calls[0][1];
    expect(params).toEqual([["UCa", "UCb"]]);
  });

  it("runs exactly one query for many ids", async () => {
    await markLiveChannelsChecked(idsOf(120));

    expect(pool.query).toHaveBeenCalledTimes(1);
    const params = mockedQuery(vi.mocked(pool.query)).mock.calls[0][1];
    expect(params).toEqual([idsOf(120)]);
  });
});

describe("findUpcomingVideoIds", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult());
  });

  it("returns [] and runs no query when channelIds is empty", async () => {
    const ids = await findUpcomingVideoIds([], 10);

    expect(ids).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns [] and runs no query when limit is 0 or negative", async () => {
    expect(await findUpcomingVideoIds(["UCa"], 0)).toEqual([]);
    expect(await findUpcomingVideoIds(["UCa"], -1)).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  // pool is mocked, so this guards the query's shape, not what it returns from postgres
  it("passes channel ids and limit as params and filters on upcoming rows only", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValueOnce(
      mockQueryResult({ rows: [{ video_id: "v1" }, { video_id: "v2" }] }),
    );

    const ids = await findUpcomingVideoIds(["UCa", "UCb"], 5);

    expect(ids).toEqual(["v1", "v2"]);
    const [sql, params] = mockedQuery(vi.mocked(pool.query)).mock.calls[0];
    expect(params).toEqual([["UCa", "UCb"], 5]);
    expect(sql).toContain("live_broadcast_content = 'upcoming'");
    expect(sql).not.toContain("'live'");
  });
});
