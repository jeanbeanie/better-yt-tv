import { describe, it, expect, vi, beforeEach } from "vitest";
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
const { fetchChannelRssVideoIds, classifyVideos } = await import("./live.js");

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
    const [, params] = vi.mocked(pool.query).mock.calls[0];
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
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toContainEqual(["a"]);
  });
});
