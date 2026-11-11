import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { demoFetch } from "./demoFetch";
import { resetDemoStore } from "./store";
import { getAllFeed } from "../api";

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
  return resp.json() as Promise<{ items: { video_id: string }[]; hasMore: boolean }>;
}

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
});
