import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { demoFetch } from "./demoFetch";
import { resetDemoStore } from "./store";
import {
  bulkUpdateChannels,
  getAllFeed,
  getChannels,
  getList,
  getListFeed,
  getLists,
  syncSubscriptions,
  updateChannel,
  type Channel,
} from "../api";

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
  const url = path.startsWith("http") ? path : `http://localhost:5179${path}`;
  const resp = await demoFetch(url, { method: "GET" });
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
const bulkPath = "http://localhost:5179/api/channels/bulk";
const patchBulk = (body?: string) =>
  demoFetch(bulkPath, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });

const SPACE_NERD = "demo-list-space-nerd";
const DEV_TALK = "demo-list-dev-talk";
const listPath = (id: string) => `http://localhost:5179/api/lists/${id}`;
const listFeedPath = (id: string, query = "") =>
  `http://localhost:5179/api/feed/lists/${id}${query}`;

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

  it("PATCHes many channels and reflects the count in GET channels and the feed", async () => {
    const resp = await patchBulk(
      JSON.stringify({ channelIds: ["demo-blender", "demo-nasa"], enabledAll: false }),
    );

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true, updatedCount: 2 });

    const list = await demoFetch("http://localhost:5179/api/channels", { method: "GET" });
    const { channels } = (await list.json()) as { channels: Channel[] };
    for (const id of ["demo-blender", "demo-nasa"]) {
      expect(channels.find((c) => c.channelId === id)?.enabledAll).toBe(false);
    }
    expect(channels.filter((c) => c.enabledAll)).toHaveLength(9);

    const feed = await feedJson("/api/feed/all?limit=200");
    expect(feed.items.some((item) => item.channel_id === "demo-blender")).toBe(false);
    expect(feed.items.some((item) => item.channel_id === "demo-nasa")).toBe(false);
  });

  it("counts only known channels when unknown ids are mixed in", async () => {
    const resp = await patchBulk(
      JSON.stringify({ channelIds: ["demo-nasa", "demo-missing"], enabledAll: false }),
    );

    expect(await resp.json()).toEqual({ ok: true, updatedCount: 1 });
    const list = await demoFetch("http://localhost:5179/api/channels", { method: "GET" });
    expect(((await list.json()) as { channels: Channel[] }).channels).toHaveLength(11);
  });

  it("returns 200 with updatedCount 0 when every id is unknown", async () => {
    const resp = await patchBulk(
      JSON.stringify({ channelIds: ["demo-missing"], enabledAll: false }),
    );

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true, updatedCount: 0 });
  });

  it("returns 400 'channelIds is required' for a missing, non-array or empty channelIds", async () => {
    const bodies = [
      undefined,
      "not json",
      "{}",
      '{"enabledAll":false}',
      '{"channelIds":"demo-nasa","enabledAll":false}',
      '{"channelIds":[],"enabledAll":false}',
      '{"channelIds":[]}',
      '{"channelIds":null,"enabledAll":"yes"}',
    ];
    for (const body of bodies) {
      const resp = await patchBulk(body);
      expect(resp.status).toBe(400);
      expect(await resp.json()).toEqual({ error: "channelIds is required" });
    }
  });

  it("returns 400 'No valid fields to update' when channelIds is valid but no boolean flag is", async () => {
    const bodies = [
      JSON.stringify({ channelIds: ["demo-nasa"] }),
      JSON.stringify({ channelIds: ["demo-nasa"], enabledAll: "yes", excludedShorts: 0 }),
    ];
    for (const body of bodies) {
      const resp = await patchBulk(body);
      expect(resp.status).toBe(400);
      expect(await resp.json()).toEqual({ error: "No valid fields to update" });
    }
  });

  it("routes PATCH /api/channels/bulk to the bulk handler, not the channel handler", async () => {
    const bulk = await patchBulk(
      JSON.stringify({ channelIds: ["demo-nasa"], enabledAll: false }),
    );
    expect(bulk.status).toBe(200);
    expect(await bulk.json()).toEqual({ ok: true, updatedCount: 1 });

    const single = await patchChannel("demo-nasa", JSON.stringify({ enabledLive: false }));
    expect(single.status).toBe(200);
    expect(await single.json()).toMatchObject({ channel: { channelId: "demo-nasa" } });
  });

  it("returns 404 for GET and POST on the bulk path", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    for (const method of ["GET", "POST"]) {
      const resp = await demoFetch(bulkPath, { method });
      expect(resp.status).toBe(404);
      expect(await resp.json()).toEqual({ error: "Not found" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("never calls the global fetch for bulk PATCH", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await patchBulk(JSON.stringify({ channelIds: ["demo-nasa"], enabledAll: false }));
    await patchBulk("{}");

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("serves the bulk PATCH through the real bulkUpdateChannels wrapper in demo mode", async () => {
    window.history.pushState({}, "", "/demo/settings/channels");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(
        bulkUpdateChannels({ channelIds: ["demo-blender", "demo-nasa"], enabledAll: false }),
      ).resolves.toEqual({ ok: true, updatedCount: 2 });
      expect(fetchMock).toHaveBeenCalledTimes(0);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("serves GET /api/lists with the three fixture lists in fixture order", async () => {
    const resp = await demoFetch("http://localhost:5179/api/lists", { method: "GET" });

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("application/json");
    const body = (await resp.json()) as { lists: Record<string, unknown>[] };
    const stamp = NOW.toISOString();
    expect(body.lists).toEqual([
      { id: SPACE_NERD, name: "Space nerd", channelCount: 5, createdAt: stamp, updatedAt: stamp },
      { id: DEV_TALK, name: "Dev talk", channelCount: 3, createdAt: stamp, updatedAt: stamp },
      {
        id: "demo-list-quick-learning",
        name: "Quick learning",
        channelCount: 3,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ]);
  });

  it("serves GET /api/lists/:listId with channels sorted by title", async () => {
    const resp = await demoFetch(listPath(DEV_TALK), { method: "GET" });

    expect(resp.status).toBe(200);
    const stamp = NOW.toISOString();
    expect(await resp.json()).toEqual({
      list: {
        id: DEV_TALK,
        name: "Dev talk",
        createdAt: stamp,
        updatedAt: stamp,
        channelIds: ["demo-computerphile", "demo-exit-node", "demo-fireship"],
        channels: [
          { channelId: "demo-computerphile", title: "Computerphile", thumbUrl: null },
          { channelId: "demo-exit-node", title: "exit node", thumbUrl: null },
          { channelId: "demo-fireship", title: "Fireship", thumbUrl: null },
        ],
      },
    });
  });

  it("returns 404 'List not found' for an unknown list on the detail and feed paths", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    for (const path of [listPath("demo-list-missing"), listFeedPath("demo-list-missing")]) {
      const resp = await demoFetch(path, { method: "GET" });
      expect(resp.status).toBe(404);
      expect(await resp.json()).toEqual({ error: "List not found" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("serves GET /api/feed/lists/:listId with the list name and only its channels", async () => {
    const resp = await demoFetch(listFeedPath(DEV_TALK), { method: "GET" });

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      list: unknown;
      items: Record<string, unknown>[];
      hasMore: boolean;
    };
    expect(body.list).toEqual({ id: DEV_TALK, name: "Dev talk" });
    expect(body.hasMore).toBe(false);
    expect(body.items.length).toBeGreaterThan(0);
    expect(Object.keys(body.items[0]).sort()).toEqual(FEED_FIELDS);
    for (const item of body.items) {
      expect(["demo-computerphile", "demo-exit-node", "demo-fireship"]).toContain(item.channel_id);
    }
  });

  it("pages the list feed with offset and limit", async () => {
    const all = await feedJson(listFeedPath(SPACE_NERD, "?limit=200"));
    expect(all.hasMore).toBe(false);
    // 28 fixture videos minus 3 shorts (45s, 46s, 46s) hidden by excludedShorts
    expect(all.items).toHaveLength(25);

    const first = await feedJson(listFeedPath(SPACE_NERD, "?limit=2"));
    expect(first.items).toEqual(all.items.slice(0, 2));
    expect(first.hasMore).toBe(true);

    const next = await feedJson(listFeedPath(SPACE_NERD, "?offset=2&limit=2"));
    expect(next.items).toEqual(all.items.slice(2, 4));

    const tail = await feedJson(listFeedPath(SPACE_NERD, `?offset=${all.items.length - 1}`));
    expect(tail.items).toEqual(all.items.slice(-1));
    expect(tail.hasMore).toBe(false);
  });

  it("caps list feed limit at 200 and falls back to defaults for malformed values", async () => {
    const all = await feedJson(listFeedPath(SPACE_NERD, "?limit=200"));

    const capped = await feedJson(listFeedPath(SPACE_NERD, "?limit=500"));
    expect(capped).toEqual(all);

    const malformed = await feedJson(listFeedPath(SPACE_NERD, "?limit=abc&offset=-5"));
    expect(malformed).toEqual(await feedJson(listFeedPath(SPACE_NERD)));
    expect(malformed.items).toHaveLength(Math.min(50, all.items.length));
    expect(malformed.hasMore).toBe(all.items.length > 50);
  });

  it("keeps a channel switched off in All on its list feed", async () => {
    await patchChannel("demo-nasa", JSON.stringify({ enabledAll: false }));

    const listFeed = await feedJson(listFeedPath(SPACE_NERD, "?limit=200"));
    expect(listFeed.items.some((item) => item.channel_id === "demo-nasa")).toBe(true);

    const allFeed = await feedJson("/api/feed/all?limit=200");
    expect(allFeed.items.some((item) => item.channel_id === "demo-nasa")).toBe(false);
  });

  it("shows a video watched through the watch route as watched on its list feed", async () => {
    const videoId = "ErAqN6gXqZQ";
    const watched = await demoFetch(watchPath(videoId), { method: "POST" });
    expect(watched.status).toBe(200);

    const feed = await feedJson(listFeedPath(SPACE_NERD, "?limit=200"));
    expect(feed.items.find((item) => item.video_id === videoId)).toMatchObject({
      is_watched: true,
    });
  });

  it("returns 404 for wrong methods on the list paths without calling fetch", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const cases: [string, string][] = [
      ["DELETE", listPath(DEV_TALK)],
      ["POST", "http://localhost:5179/api/lists"],
      ["POST", listFeedPath(DEV_TALK)],
    ];
    for (const [method, path] of cases) {
      const resp = await demoFetch(path, { method });
      expect(resp.status).toBe(404);
      expect(await resp.json()).toEqual({ error: "Not found" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("does not route the list feed path into the watch handlers", async () => {
    const watched = await demoFetch(watchPath(WATCH_ID), { method: "POST" });
    expect(watched.status).toBe(200);
    expect(await watched.json()).toEqual({ ok: true });

    const listWatch = await demoFetch(
      "http://localhost:5179/api/feed/lists/demo-list-dev-talk/watch",
      { method: "POST" },
    );
    expect(listWatch.status).toBe(404);
  });

  it("serves the list wrappers through the real api functions in demo mode", async () => {
    window.history.pushState({}, "", "/demo/lists");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const { lists } = await getLists();
      const { list } = await getList(DEV_TALK);
      const feed = await getListFeed(SPACE_NERD, { limit: 2 });

      expect(lists).toHaveLength(3);
      expect(list).toMatchObject({ id: DEV_TALK, name: "Dev talk" });
      expect(feed.list).toEqual({ id: SPACE_NERD, name: "Space nerd" });
      expect(feed.items).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(0);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});
