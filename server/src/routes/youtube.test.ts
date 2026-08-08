import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB pool so no real Postgres connection is needed
vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

// Bypass real session lookup -- attach a fake userId like requireAuth would
vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = "test-user-id";
    next();
  },
}));

vi.mock("../auth/crypto.js", () => ({
  decryptRefreshToken: vi.fn(() => "fake-refresh-token"),
}));

vi.mock("../auth/google.js", () => ({
  refreshAccessToken: vi.fn(async () => ({
    access_token: "fake-access-token",
    expires_in: 3600,
    expires_at: Date.now() + 3600_000,
  })),
}));

const { pool } = await import("../db/pool.js");
const { youtubeRouter } = await import("./youtube.js");

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/youtube", youtubeRouter);
  return app;
}

function mockSubscriptionsFetch(items: Array<{ channelId: string; title: string; thumbUrl: string | null }>) {
  global.fetch = vi.fn(async () =>
    new Response(
      JSON.stringify({
        items: items.map((item) => ({
          snippet: {
            resourceId: { channelId: item.channelId },
            title: item.title,
            thumbnails: item.thumbUrl ? { medium: { url: item.thumbUrl } } : {},
          },
        })),
      }),
      { status: 200 },
    ),
  ) as unknown as typeof fetch;
}

// getGoogleAccessToken always looks up oauth_tokens first, regardless of
// what the sync insert itself does -- stub that lookup so tests can focus
// on the subscriptions/preferences insert in isolation.
function mockOauthTokenLookup(onSyncInsert: (params: any[]) => any) {
  vi.mocked(pool.query).mockImplementation(async (sql: any, params: any) => {
    if (String(sql).includes("oauth_tokens")) {
      return { rows: [{ refresh_token_ciphertext: "fake-ciphertext" }], rowCount: 1 } as any;
    }
    return onSyncInsert(params);
  });
}

function syncInsertCalls() {
  return vi
    .mocked(pool.query)
    .mock.calls.filter(([sql]) => String(sql).includes("with subs as"));
}

describe("POST /api/youtube/sync-subscriptions", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("upserts subscriptions and preferences in a single query", async () => {
    mockSubscriptionsFetch([
      { channelId: "chan1", title: "Channel One", thumbUrl: "https://example.com/1.jpg" },
      { channelId: "chan2", title: "Channel Two", thumbUrl: null },
    ]);
    mockOauthTokenLookup(async () => ({ rows: [], rowCount: 0 }));

    const res = await request(buildApp())
      .post("/api/youtube/sync-subscriptions")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, syncedCount: 2 });

    // One statement for the whole subscriptions+preferences write, not one
    // pair of queries per subscription
    const calls = syncInsertCalls();
    expect(calls).toHaveLength(1);
    const [sql, params] = calls[0];
    expect(sql).toContain("insert into channel_preferences");
    expect(params).toEqual([
      "test-user-id",
      ["chan1", "chan2"],
      ["Channel One", "Channel Two"],
      ["https://example.com/1.jpg", null],
    ]);
  });

  it("skips the insert entirely when there are no subscriptions", async () => {
    mockSubscriptionsFetch([]);
    mockOauthTokenLookup(async () => ({ rows: [], rowCount: 0 }));

    const res = await request(buildApp())
      .post("/api/youtube/sync-subscriptions")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, syncedCount: 0 });
    expect(syncInsertCalls()).toHaveLength(0);
  });

  it("surfaces a DB failure as a 500 rather than a partial write", async () => {
    mockSubscriptionsFetch([{ channelId: "chan1", title: "Channel One", thumbUrl: null }]);
    mockOauthTokenLookup(async () => {
      throw new Error("connection reset");
    });

    const res = await request(buildApp())
      .post("/api/youtube/sync-subscriptions")
      .set("Cookie", "sid=fake-session");

    expect(res.status).toBe(500);
    expect(syncInsertCalls()).toHaveLength(1);
  });
});
