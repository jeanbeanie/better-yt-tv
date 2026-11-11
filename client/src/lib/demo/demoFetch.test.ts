import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { demoFetch } from "./demoFetch";
import { resetDemoStore } from "./store";
import { getAllFeed, getChannels, syncSubscriptions, updateChannel, type Channel } from "../api";

const NOW = new Date("2026-11-11T12:00:00Z");
const FEED_FIELDS = [
  "channel_id",
  "channel_title",
  "is_watched",
  "published_at",
  "thumb_url",
  "title",
  "video_id",
  "watched_at",
];

async function feedJson(path: string) {
  const resp = await demoFetch(`http://localhost:5179${path}`, { method: "GET" });
  expect(resp.status).toBe(200);
  return resp.json() as Promise<{ items: FeedRow[]; hasMore: boolean }>;
}

type FeedRow = { channel_id: string; video_id: string; is_watched: boolean; watched_at: string | null };

const WATCH_ID = "pvUy69I_Xuk";
const watchPath = (id: string) => `http://localhost:5179/api/feed/videos/${id}/watch`;
const unwatchPath = (id: string) => `http://localhost:5179/api/feed/videos/${id}/unwatch`;
const channelPath = (id: string) => `http://localhost:5179/api/channels/${id}`;
const patchChannel = (id: string, body?: string) =>
  demoFetch(channelPath(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });

describe("demoFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetDemoStore();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a 404 JSON response for every path", async () => {
    const get = await demoFetch("http://localhost:5179/api/nope", { method: "GET" });
    expect(get.status).toBe(404);
    expect(get.headers.get("Content-Type")).toBe("application/json");
    expect(await get.json()).toEqual({ error: "Not found" });

    const post = await demoFetch("http://localhost:5179/api/youtube/refresh-all-cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual: true }),
    });
    expect(post.status).toBe(404);
    expect(await post.json()).toEqual({ error: "Not found" });
  });

  it("never calls the global fetch", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await demoFetch("http://localhost:5179/api/feed/all", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("keeps whoami and other routes 404 without calling global fetch", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const get = await demoFetch("/api/auth/whoami", { method: "GET" });
    const post = await demoFetch("/api/auth/whoami", { method: "POST" });
    const logout = await demoFetch("/api/auth/logout", { method: "GET" });
    const unknown = await demoFetch("/api/nope");
    for (const resp of [get, post, logout, unknown]) {
      expect(resp.status).toBe(404);
      expect(await resp.json()).toEqual({ error: "Not found" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("serves GET /api/feed/all as JSON with 50 items and hasMore by default", async () => {
    const resp = await demoFetch("http://localhost:5179/api/feed/all", { method: "GET" });

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("application/json");
    const body = (await resp.json()) as { items: Record<string, unknown>[]; hasMore: boolean };
    expect(body.items).toHaveLength(50);
    expect(body.hasMore).toBe(true);
    expect(Object.keys(body.items[0]).sort()).toEqual(FEED_FIELDS);
  });

  it("pages with offset and limit", async () => {
    const second = await feedJson("/api/feed/all?offset=50&limit=50");
    expect(second.items).toHaveLength(7);
    expect(second.hasMore).toBe(false);
  });

  it("caps limit at 200 and returns every visible video", async () => {
    const body = await feedJson("/api/feed/all?limit=500");
    expect(body.items).toHaveLength(57);
    expect(body.hasMore).toBe(false);
  });

  it("falls back to default offset and limit for malformed values", async () => {
    const defaults = await feedJson("/api/feed/all");

    const badLimit = await feedJson("/api/feed/all?limit=abc");
    expect(badLimit.items).toHaveLength(50);
    expect(badLimit.hasMore).toBe(true);

    const negativeOffset = await feedJson("/api/feed/all?offset=-5");
    expect(negativeOffset.items).toEqual(defaults.items);
  });

  it("matches the feed path with a query string", async () => {
    const body = await feedJson("/api/feed/all?limit=5");
    expect(body.items).toHaveLength(5);
  });

  it("returns 404 for POST /api/feed/all", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const resp = await demoFetch("http://localhost:5179/api/feed/all", { method: "POST" });

    expect(resp.status).toBe(404);
    expect(await resp.json()).toEqual({ error: "Not found" });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("serves the feed through the real getAllFeed wrapper in demo mode", async () => {
    window.history.pushState({}, "", "/demo/all");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await getAllFeed();

      expect(result.items).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(0);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("marks a video watched and leaves the other items unchanged", async () => {
    const before = await feedJson("/api/feed/all?limit=200");

    const resp = await demoFetch(watchPath(WATCH_ID), { method: "POST" });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true });

    const after = await feedJson("/api/feed/all?limit=200");
    const row = after.items.find((item) => item.video_id === WATCH_ID);
    expect(row?.is_watched).toBe(true);
    expect(row?.watched_at).not.toBeNull();
    expect(after.items.filter((item) => item.video_id !== WATCH_ID)).toEqual(
      before.items.filter((item) => item.video_id !== WATCH_ID),
    );
  });

  it("unwatch after watch keeps the item in the feed with null watched_at", async () => {
    await demoFetch(watchPath(WATCH_ID), { method: "POST" });

    const resp = await demoFetch(unwatchPath(WATCH_ID), { method: "POST" });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true });

    const after = await feedJson("/api/feed/all?limit=200");
    const row = after.items.find((item) => item.video_id === WATCH_ID);
    expect(row).toMatchObject({ is_watched: false, watched_at: null });
  });

  it("unwatch of a never watched id returns ok and leaves the feed unchanged", async () => {
    const before = await feedJson("/api/feed/all?limit=200");

    const resp = await demoFetch(unwatchPath(WATCH_ID), { method: "POST" });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true });

    expect(await feedJson("/api/feed/all?limit=200")).toEqual(before);
  });

  it("accepts an unknown video id and leaves the feed unchanged", async () => {
    const before = await feedJson("/api/feed/all?limit=200");

    for (const path of [watchPath("not-a-fixture-id"), unwatchPath("not-a-fixture-id")]) {
      const resp = await demoFetch(path, { method: "POST" });
      expect(resp.status).toBe(200);
      expect(await resp.json()).toEqual({ ok: true });
    }

    expect(await feedJson("/api/feed/all?limit=200")).toEqual(before);
  });

  it.each(["i1bE2c-SlcA", "_y9JuojAIg0", "-0JKHuzJ67A"])(
    "matches video id %s with dashes and underscores",
    async (id) => {
      const watched = await demoFetch(watchPath(id), { method: "POST" });
      expect(watched.status).toBe(200);
      const afterWatch = await feedJson("/api/feed/all?limit=200");
      expect(afterWatch.items.find((item) => item.video_id === id)?.is_watched).toBe(true);

      const unwatched = await demoFetch(unwatchPath(id), { method: "POST" });
      expect(unwatched.status).toBe(200);
      const afterUnwatch = await feedJson("/api/feed/all?limit=200");
      expect(afterUnwatch.items.find((item) => item.video_id === id)?.is_watched).toBe(false);
    },
  );

  it("returns 404 for GET on the watch and unwatch paths", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    for (const path of [watchPath(WATCH_ID), unwatchPath(WATCH_ID)]) {
      const resp = await demoFetch(path, { method: "GET" });
      expect(resp.status).toBe(404);
      expect(await resp.json()).toEqual({ error: "Not found" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("never calls the global fetch for watch or unwatch", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await demoFetch(watchPath(WATCH_ID), { method: "POST" });
    await demoFetch(unwatchPath(WATCH_ID), { method: "POST" });

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("serves GET /api/channels as JSON with the 11 fixture channels", async () => {
    const resp = await demoFetch("http://localhost:5179/api/channels", { method: "GET" });

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("application/json");
    const body = (await resp.json()) as { channels: Channel[] };
    expect(body.channels).toHaveLength(11);
    for (const channel of body.channels) {
      expect(Object.keys(channel).sort()).toEqual([
        "channelId",
        "enabledAll",
        "enabledLive",
        "excludedShorts",
        "thumbUrl",
        "title",
      ]);
      expect(channel).toMatchObject({
        thumbUrl: null,
        enabledAll: true,
        enabledLive: true,
        excludedShorts: true,
      });
    }
  });

  it("serves POST /api/youtube/sync-subscriptions with the fixture channel count", async () => {
    const resp = await demoFetch("http://localhost:5179/api/youtube/sync-subscriptions", {
      method: "POST",
    });

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true, syncedCount: 11 });
  });

  it("returns 404 for POST /api/channels and GET /api/youtube/sync-subscriptions", async () => {
    const post = await demoFetch("http://localhost:5179/api/channels", { method: "POST" });
    const get = await demoFetch("http://localhost:5179/api/youtube/sync-subscriptions", {
      method: "GET",
    });

    expect(post.status).toBe(404);
    expect(get.status).toBe(404);
  });

  it("never calls the global fetch for channels or sync", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await demoFetch("http://localhost:5179/api/channels", { method: "GET" });
    await demoFetch("http://localhost:5179/api/youtube/sync-subscriptions", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("serves channels and sync through the real api wrappers in demo mode", async () => {
    window.history.pushState({}, "", "/demo/settings/channels");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const { channels } = await getChannels();
      const sync = await syncSubscriptions();

      expect(channels).toHaveLength(11);
      expect(sync).toEqual({ ok: true, syncedCount: 11 });
      expect(fetchMock).toHaveBeenCalledTimes(0);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("PATCHes a channel and reflects it in GET /api/channels and the feed", async () => {
    const resp = await patchChannel("demo-nasa", JSON.stringify({ enabledAll: false }));

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({
      channel: {
        channelId: "demo-nasa",
        enabledAll: false,
        enabledLive: true,
        excludedShorts: true,
        updatedAt: NOW.toISOString(),
      },
    });

    const list = await demoFetch("http://localhost:5179/api/channels", { method: "GET" });
    const { channels } = (await list.json()) as { channels: Channel[] };
    expect(channels.find((c) => c.channelId === "demo-nasa")?.enabledAll).toBe(false);

    const feed = await feedJson("/api/feed/all?limit=200");
    expect(feed.items.some((item) => item.channel_id === "demo-nasa")).toBe(false);
  });

  it("leaves the flags a partial patch does not name unchanged", async () => {
    await patchChannel("demo-nasa", JSON.stringify({ excludedShorts: false }));
    const resp = await patchChannel("demo-nasa", JSON.stringify({ enabledLive: false }));

    expect(await resp.json()).toMatchObject({
      channel: { enabledAll: true, enabledLive: false, excludedShorts: false },
    });
  });

  it("returns 400 for an empty or non-boolean patch", async () => {
    const bodies = [undefined, "{}", '{"enabledAll":"yes"}', "not json", "null"];
    for (const body of bodies) {
      const resp = await patchChannel("demo-nasa", body);
      expect(resp.status).toBe(400);
      expect(await resp.json()).toEqual({ error: "No valid fields to update" });
    }
  });

  it("returns 404 for an unknown channel with a valid patch", async () => {
    const resp = await patchChannel("demo-missing", JSON.stringify({ enabledAll: false }));

    expect(resp.status).toBe(404);
    expect(await resp.json()).toEqual({ error: "Channel preferences not found" });
  });

  it("validates the patch before looking up the channel", async () => {
    const resp = await patchChannel("demo-missing", JSON.stringify({ enabledAll: "yes" }));

    expect(resp.status).toBe(400);
    expect(await resp.json()).toEqual({ error: "No valid fields to update" });
  });

  it("returns 404 for GET and POST on the channel path", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    for (const method of ["GET", "POST"]) {
      const resp = await demoFetch(channelPath("demo-nasa"), { method });
      expect(resp.status).toBe(404);
      expect(await resp.json()).toEqual({ error: "Not found" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("never calls the global fetch for channel PATCH", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await patchChannel("demo-nasa", JSON.stringify({ enabledAll: false }));

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("serves the channel PATCH through the real updateChannel wrapper in demo mode", async () => {
    window.history.pushState({}, "", "/demo/settings/channels");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(updateChannel("demo-nasa", { enabledAll: false })).resolves.toMatchObject({
        channel: { channelId: "demo-nasa", enabledAll: false },
      });
      expect(fetchMock).toHaveBeenCalledTimes(0);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});
