import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, getAllFeed } from "./api";

function mockFetchOnce(body: string, status: number) {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, { status })) as unknown as typeof fetch;
}

async function getFeedError() {
  return getAllFeed().catch((err) => err);
}

describe("apiFetch error parsing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts the message from a well-formed JSON error body", async () => {
    mockFetchOnce(JSON.stringify({ error: "Not found" }), 404);

    const err = await getFeedError();

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "Not found", status: 404 });
  });

  it("falls back cleanly instead of throwing when the body isn't JSON at all", async () => {
    // Simulates hitting an unmatched route: Express's default HTML 404 page,
    // which resp.json() fails to parse -- this is the exact case the old
    // (always-true) isApiErrorPayload let a `null` payload through for,
    // causing payload.message to throw a raw TypeError instead of this.
    mockFetchOnce("<html>Cannot GET /nope</html>", 404);

    const err = await getFeedError();

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "all feed failed: 404", status: 404 });
  });

  it("falls back cleanly when the JSON body isn't an object", async () => {
    mockFetchOnce(JSON.stringify("just a string"), 500);

    const err = await getFeedError();

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "all feed failed: 500", status: 500 });
  });
});
