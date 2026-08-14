import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ApiError,
  getAllFeed,
  markVideoWatched,
  markVideoUnwatched,
  shouldRedirectToLogin,
} from "./api";

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

describe("mark watched/unwatched auth handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const authErrorBody = JSON.stringify({
    code: "AUTH_REQUIRED",
    message: "Your session is no longer valid. Please sign in again.",
  });

  it("markVideoWatched surfaces an ApiError that triggers a login redirect on 401", async () => {
    mockFetchOnce(authErrorBody, 401);

    const err = await markVideoWatched("v1").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(shouldRedirectToLogin(err)).toBe(true);
  });

  it("markVideoUnwatched surfaces an ApiError that triggers a login redirect on 401", async () => {
    mockFetchOnce(authErrorBody, 401);

    const err = await markVideoUnwatched("v1").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(shouldRedirectToLogin(err)).toBe(true);
  });
});
