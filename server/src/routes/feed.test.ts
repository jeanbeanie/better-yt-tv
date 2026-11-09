import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockPool, mockedQuery, mockQueryResult } from "../testUtils/pgMocks.js";
import type { AuthedRequest } from "../auth/requireAuth.js";

vi.mock("../db/pool.js", () => ({
  pool: createMockPool(),
}));

let mockAuthPasses = true;

vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (!mockAuthPasses) {
      return res.status(401).json({ code: "AUTH_REQUIRED", message: "Not signed in" });
    }
    (req as AuthedRequest).userId = "test-user-id";
    next();
  },
}));

const { pool } = await import("../db/pool.js");
const { feedRouter, applyRoundRobin } = await import("./feed.js");

type Row = { channel_id: string; video_id: string };

function buildApp() {
  const app = express();
  app.use("/api/feed", feedRouter);
  return app;
}

// rows already sorted published_at desc, same order the real query returns
function makeRows() {
  return [
    { video_id: "a3", channel_id: "A", channel_title: "A", title: "a3", published_at: "3", thumb_url: null, watched_at: null, is_watched: false },
    { video_id: "a2", channel_id: "A", channel_title: "A", title: "a2", published_at: "2", thumb_url: null, watched_at: null, is_watched: false },
    { video_id: "b1", channel_id: "B", channel_title: "B", title: "b1", published_at: "1", thumb_url: null, watched_at: null, is_watched: false },
    { video_id: "a1", channel_id: "A", channel_title: "A", title: "a1", published_at: "0", thumb_url: null, watched_at: null, is_watched: false },
    { video_id: "c1", channel_id: "C", channel_title: "C", title: "c1", published_at: "-1", thumb_url: null, watched_at: null, is_watched: false },
  ];
}

describe("GET /api/feed/all", () => {
  beforeEach(() => {
    mockAuthPasses = true;
    vi.mocked(pool.query).mockReset();
  });

  it("returns videos spread across channels instead of grouped by date alone", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: makeRows() }),
    );

    const res = await request(buildApp()).get("/api/feed/all");

    expect(res.status).toBe(200);
    expect(res.body.items.map((r: Row) => r.video_id)).toEqual(["a3", "b1", "c1", "a2", "a1"]);
    expect(res.body.hasMore).toBe(false);
  });

  it("paginates with offset and limit, reporting hasMore correctly", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: makeRows() }),
    );

    const firstPage = await request(buildApp()).get("/api/feed/all?limit=2");
    expect(firstPage.body.items.map((r: Row) => r.video_id)).toEqual(["a3", "b1"]);
    expect(firstPage.body.hasMore).toBe(true);

    const secondPage = await request(buildApp()).get("/api/feed/all?offset=2&limit=2");
    expect(secondPage.body.items.map((r: Row) => r.video_id)).toEqual(["c1", "a2"]);
    expect(secondPage.body.hasMore).toBe(true);

    const lastPage = await request(buildApp()).get("/api/feed/all?offset=4&limit=2");
    expect(lastPage.body.items.map((r: Row) => r.video_id)).toEqual(["a1"]);
    expect(lastPage.body.hasMore).toBe(false);
  });

  // pool is mocked, so this guards the query text only, not the filtering result
  it("excludes upcoming streams in the feed query", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: makeRows() }),
    );

    const res = await request(buildApp()).get("/api/feed/all");

    expect(res.status).toBe(200);
    const feedCall = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) => String(sql).includes("join videos_cache"));
    expect(String(feedCall?.[0])).toContain("coalesce(v.live_broadcast_content, 'none') <> 'upcoming'");
  });
});

const LIST_ID = "11111111-1111-1111-1111-111111111111";

function mockListLookup(rows: Row[]) {
  mockedQuery(vi.mocked(pool.query)).mockImplementation(async (sql) => {
    if (sql.includes("from lists")) {
      return mockQueryResult({
        rows: [{ id: LIST_ID, name: "My List" }],
        rowCount: 1,
      });
    }
    return mockQueryResult({ rows });
  });
}

describe("GET /api/feed/lists/:listId", () => {
  beforeEach(() => {
    mockAuthPasses = true;
    vi.mocked(pool.query).mockReset();
  });

  it("returns videos spread across channels instead of grouped by date alone", async () => {
    mockListLookup(makeRows());

    const res = await request(buildApp()).get(`/api/feed/lists/${LIST_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((r: Row) => r.video_id)).toEqual(["a3", "b1", "c1", "a2", "a1"]);
    expect(res.body.hasMore).toBe(false);
  });

  it("paginates with offset and limit", async () => {
    mockListLookup(makeRows());

    const firstPage = await request(buildApp()).get(`/api/feed/lists/${LIST_ID}?limit=2`);
    expect(firstPage.body.items.map((r: Row) => r.video_id)).toEqual(["a3", "b1"]);
    expect(firstPage.body.hasMore).toBe(true);

    const secondPage = await request(buildApp()).get(`/api/feed/lists/${LIST_ID}?offset=2&limit=2`);
    expect(secondPage.body.items.map((r: Row) => r.video_id)).toEqual(["c1", "a2"]);
    expect(secondPage.body.hasMore).toBe(true);
  });

  // pool is mocked, so this guards the query text only, not the filtering result
  it("excludes upcoming streams in the feed query", async () => {
    mockListLookup(makeRows());

    const res = await request(buildApp()).get(`/api/feed/lists/${LIST_ID}`);

    expect(res.status).toBe(200);
    const feedCall = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) => String(sql).includes("join videos_cache"));
    expect(String(feedCall?.[0])).toContain("coalesce(v.live_broadcast_content, 'none') <> 'upcoming'");
  });

  // listId format must be checked after requireAuth, not via
  // router.param() (that ran before route middleware, so a malformed id
  // would 404 without ever checking auth)
  it("401s a malformed listId without touching the database, when unauthenticated", async () => {
    mockAuthPasses = false;

    const res = await request(buildApp()).get("/api/feed/lists/not-a-uuid");

    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("404s a malformed listId once authenticated", async () => {
    const res = await request(buildApp()).get("/api/feed/lists/not-a-uuid");

    expect(res.status).toBe(404);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("applyRoundRobin", () => {
  it("spreads out a busy channel's videos instead of leaving them consecutive", () => {
    // already sorted published_at desc, same order the real query returns
    const rows: Row[] = [
      { channel_id: "A", video_id: "a3" },
      { channel_id: "A", video_id: "a2" },
      { channel_id: "B", video_id: "b1" },
      { channel_id: "A", video_id: "a1" },
      { channel_id: "C", video_id: "c1" },
    ];

    const result = applyRoundRobin(rows);

    expect(result.map((r) => r.video_id)).toEqual(["a3", "b1", "c1", "a2", "a1"]);
  });

  it("keeps every row, only reorders", () => {
    const rows: Row[] = [
      { channel_id: "A", video_id: "a1" },
      { channel_id: "B", video_id: "b1" },
      { channel_id: "A", video_id: "a2" },
    ];

    const result = applyRoundRobin(rows);

    expect(result).toHaveLength(rows.length);
    expect(result.map((r) => r.video_id).sort()).toEqual(["a1", "a2", "b1"]);
  });

  it("handles a single channel by leaving its order unchanged", () => {
    const rows: Row[] = [
      { channel_id: "A", video_id: "a3" },
      { channel_id: "A", video_id: "a2" },
      { channel_id: "A", video_id: "a1" },
    ];

    const result = applyRoundRobin(rows);

    expect(result.map((r) => r.video_id)).toEqual(["a3", "a2", "a1"]);
  });

  it("handles an empty array", () => {
    expect(applyRoundRobin([])).toEqual([]);
  });

  it("preserves extra fields on each row untouched", () => {
    const rows = [
      { channel_id: "A", video_id: "a1", title: "First" },
      { channel_id: "B", video_id: "b1", title: "Second" },
    ];

    const result = applyRoundRobin(rows);

    expect(result).toEqual(rows);
  });
});

describe("GET /api/feed/live", () => {
  // fixed clock so the upcoming window is deterministic, only Date is faked
  // so supertest's real socket timers keep working
  const NOW = new Date("2026-11-07T12:00:00Z");
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  beforeEach(() => {
    mockAuthPasses = true;
    vi.mocked(pool.query).mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function liveRow(overrides: Record<string, unknown>) {
    return {
      video_id: "v",
      channel_id: "A",
      channel_title: "Channel A",
      title: "title",
      thumb_url: null,
      live_broadcast_content: "live",
      scheduled_start_time: null,
      actual_start_time: null,
      ...overrides,
    };
  }

  function mockRows(rows: Record<string, unknown>[]) {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({ rows }));
  }

  it("401s when unauthenticated without touching the database", async () => {
    mockAuthPasses = false;

    const res = await request(buildApp()).get("/api/feed/live");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_REQUIRED");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("splits rows into live and upcoming, dropping status none", async () => {
    mockRows([
      liveRow({ video_id: "live1", actual_start_time: new Date(NOW.getTime() - HOUR) }),
      liveRow({
        video_id: "up1",
        live_broadcast_content: "upcoming",
        scheduled_start_time: new Date(NOW.getTime() + DAY),
      }),
      liveRow({ video_id: "none1", live_broadcast_content: "none" }),
    ]);

    const res = await request(buildApp()).get("/api/feed/live");

    expect(res.status).toBe(200);
    expect(res.body.live.map((r: Row) => r.video_id)).toEqual(["live1"]);
    expect(res.body.upcoming.map((r: Row) => r.video_id)).toEqual(["up1"]);
  });

  it("orders live by actual start desc with unknown starts last", async () => {
    mockRows([
      liveRow({ video_id: "older", actual_start_time: "2026-11-07T10:00:00Z" }),
      liveRow({ video_id: "unknown", actual_start_time: null }),
      liveRow({ video_id: "newer", actual_start_time: "2026-11-07T11:00:00Z" }),
    ]);

    const res = await request(buildApp()).get("/api/feed/live");

    expect(res.body.live.map((r: Row) => r.video_id)).toEqual(["newer", "older", "unknown"]);
  });

  it("orders upcoming by scheduled start asc", async () => {
    mockRows([
      liveRow({
        video_id: "later",
        live_broadcast_content: "upcoming",
        scheduled_start_time: "2026-11-09T12:00:00Z",
      }),
      liveRow({
        video_id: "sooner",
        live_broadcast_content: "upcoming",
        scheduled_start_time: "2026-11-08T12:00:00Z",
      }),
    ]);

    const res = await request(buildApp()).get("/api/feed/live");

    expect(res.body.upcoming.map((r: Row) => r.video_id)).toEqual(["sooner", "later"]);
  });

  it("keeps upcoming within 2 hours past to 7 days ahead, drops null schedules", async () => {
    mockRows([
      liveRow({
        video_id: "ahead6d",
        live_broadcast_content: "upcoming",
        scheduled_start_time: new Date(NOW.getTime() + 6 * DAY),
      }),
      liveRow({
        video_id: "ago1h",
        live_broadcast_content: "upcoming",
        scheduled_start_time: new Date(NOW.getTime() - HOUR),
      }),
      liveRow({
        video_id: "ago3h",
        live_broadcast_content: "upcoming",
        scheduled_start_time: new Date(NOW.getTime() - 3 * HOUR),
      }),
      liveRow({
        video_id: "ahead8d",
        live_broadcast_content: "upcoming",
        scheduled_start_time: new Date(NOW.getTime() + 8 * DAY),
      }),
      liveRow({
        video_id: "nullSchedule",
        live_broadcast_content: "upcoming",
        scheduled_start_time: null,
      }),
    ]);

    const res = await request(buildApp()).get("/api/feed/live");

    expect(res.body.upcoming.map((r: Row) => r.video_id)).toEqual(["ago1h", "ahead6d"]);
  });

  it("returns only the 7 documented keys per item", async () => {
    mockRows([
      liveRow({
        video_id: "live1",
        thumb_url: "https://example.test/t.jpg",
        actual_start_time: new Date(NOW.getTime() - HOUR),
      }),
      liveRow({
        video_id: "up1",
        live_broadcast_content: "upcoming",
        scheduled_start_time: new Date(NOW.getTime() + DAY),
      }),
    ]);

    const res = await request(buildApp()).get("/api/feed/live");
    const expectedKeys = [
      "video_id",
      "channel_id",
      "channel_title",
      "title",
      "thumb_url",
      "scheduled_start_time",
      "actual_start_time",
    ].sort();

    expect(Object.keys(res.body.live[0]).sort()).toEqual(expectedKeys);
    expect(Object.keys(res.body.upcoming[0]).sort()).toEqual(expectedKeys);
  });

  it("returns empty lists when nothing is live or upcoming", async () => {
    mockRows([]);

    const res = await request(buildApp()).get("/api/feed/live");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ live: [], upcoming: [] });
  });

  // pool is mocked, so this guards the SQL text rather than running it
  it("queries with fail-open preference join and the enabled_live filter", async () => {
    mockRows([]);

    await request(buildApp()).get("/api/feed/live");

    const [sql, params] = mockedQuery(vi.mocked(pool.query)).mock.calls[0];
    expect(sql).toContain("coalesce(cp.enabled_live, true)");
    expect(sql).toContain("left join channel_preferences");
    expect(sql).not.toContain("enabled_all");
    expect(params).toEqual(["test-user-id"]);
  });

  it("500s when the query rejects", async () => {
    mockedQuery(vi.mocked(pool.query)).mockRejectedValue(new Error("connection lost"));

    const res = await request(buildApp()).get("/api/feed/live");

    expect(res.status).toBe(500);
  });
});
