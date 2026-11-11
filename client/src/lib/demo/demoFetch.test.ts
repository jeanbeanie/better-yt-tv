import { describe, it, expect, vi, beforeEach } from "vitest";
import { demoFetch } from "./demoFetch";

describe("demoFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a 404 JSON response for every path", async () => {
    const get = await demoFetch("http://localhost:5179/api/feed/all", { method: "GET" });
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

  it("serves GET /api/auth/whoami as the demo user", async () => {
    const expected = { user: { id: "demo-user", email: null, google_sub: "demo", is_admin: false } };
    const absolute = await demoFetch("http://localhost:5179/api/auth/whoami", { method: "GET" });
    const relative = await demoFetch("/api/auth/whoami");
    for (const resp of [absolute, relative]) {
      expect(resp.status).toBe(200);
      expect(await resp.json()).toEqual(expected);
    }
  });

  it("keeps other whoami methods and other routes 404", async () => {
    const post = await demoFetch("/api/auth/whoami", { method: "POST" });
    const logout = await demoFetch("/api/auth/logout", { method: "GET" });
    const feed = await demoFetch("/api/feed/all");
    for (const resp of [post, logout, feed]) {
      expect(resp.status).toBe(404);
      expect(await resp.json()).toEqual({ error: "Not found" });
    }
  });

  it("never calls the global fetch for whoami", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await demoFetch("/api/auth/whoami");

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
