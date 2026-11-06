import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchChannelRssVideoIds } from "./live.js";

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
