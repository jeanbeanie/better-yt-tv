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
});
