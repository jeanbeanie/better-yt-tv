import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = "test-user-id";
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
    vi.mocked(pool.query).mockReset();
  });

  it("returns videos spread across channels instead of grouped by date alone", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: makeRows() } as any);

    const res = await request(buildApp()).get("/api/feed/all");

    expect(res.status).toBe(200);
    expect(res.body.items.map((r: Row) => r.video_id)).toEqual(["a3", "b1", "c1", "a2", "a1"]);
    expect(res.body.hasMore).toBe(false);
  });

  it("paginates with offset and limit, reporting hasMore correctly", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: makeRows() } as any);

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
});

const LIST_ID = "11111111-1111-1111-1111-111111111111";

function mockListLookup(rows: Row[]) {
  vi.mocked(pool.query).mockImplementation(async (sql: any) => {
    if (String(sql).includes("from lists")) {
      return { rows: [{ id: LIST_ID, name: "My List" }], rowCount: 1 } as any;
    }
    return { rows } as any;
  });
}

describe("GET /api/feed/lists/:listId", () => {
  beforeEach(() => {
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
