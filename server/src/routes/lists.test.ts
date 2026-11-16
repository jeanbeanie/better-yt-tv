import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPool, mockedQuery, mockQueryResult } from "../testUtils/pgMocks.js";
import type { AuthedRequest } from "../auth/requireAuth.js";
import { feedRouter } from "./feed.js";

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
const { listsRouter } = await import("./lists.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/lists", listsRouter);
  return app;
}

const VALID_LIST_ID = "11111111-1111-1111-1111-111111111111";
const MALFORMED_LIST_ID = "not-a-uuid";

// listId format must be checked after requireAuth in every handler, not via
// router.param() (that runs before route middleware, so a malformed id
// would 404 without ever checking auth)
describe("listId auth-before-validation ordering", () => {
  beforeEach(() => {
    mockAuthPasses = true;
    vi.mocked(pool.query).mockReset();
  });

  describe("GET /api/lists/:listId", () => {
    it("401s a malformed listId without touching the database, when unauthenticated", async () => {
      mockAuthPasses = false;

      const res = await request(buildApp()).get(`/api/lists/${MALFORMED_LIST_ID}`);

      expect(res.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("404s a malformed listId once authenticated", async () => {
      const res = await request(buildApp()).get(`/api/lists/${MALFORMED_LIST_ID}`);

      expect(res.status).toBe(404);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("404s a well-formed but nonexistent listId once authenticated", async () => {
      mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
        mockQueryResult({ rows: [], rowCount: 0 }),
      );

      const res = await request(buildApp()).get(`/api/lists/${VALID_LIST_ID}`);

      expect(res.status).toBe(404);
      expect(pool.query).toHaveBeenCalled();
    });
  });

  describe("PUT /api/lists/:listId", () => {
    it("401s a malformed listId without touching the database, when unauthenticated", async () => {
      mockAuthPasses = false;

      const res = await request(buildApp())
        .put(`/api/lists/${MALFORMED_LIST_ID}`)
        .send({ name: "New name", channelIds: [] });

      expect(res.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it("404s a malformed listId once authenticated", async () => {
      const res = await request(buildApp())
        .put(`/api/lists/${MALFORMED_LIST_ID}`)
        .send({ name: "New name", channelIds: [] });

      expect(res.status).toBe(404);
      expect(pool.connect).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/lists/:listId", () => {
    it("401s a malformed listId without touching the database, when unauthenticated", async () => {
      mockAuthPasses = false;

      const res = await request(buildApp()).delete(`/api/lists/${MALFORMED_LIST_ID}`);

      expect(res.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("404s a malformed listId once authenticated", async () => {
      const res = await request(buildApp()).delete(`/api/lists/${MALFORMED_LIST_ID}`);

      expect(res.status).toBe(404);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("404s a well-formed but nonexistent listId once authenticated", async () => {
      mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
        mockQueryResult({ rows: [], rowCount: 0 }),
      );

      const res = await request(buildApp()).delete(`/api/lists/${VALID_LIST_ID}`);

      expect(res.status).toBe(404);
      expect(pool.query).toHaveBeenCalled();
    });
  });
});

const USER_ID = "test-user-id";
const LIST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LIST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER_LIST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DEFAULT_TIME = "2025-01-01T00:00:00Z";

function listUuid(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

// 11 character youtube style id
function videoId(n: number) {
  return `vid${String(n).padStart(8, "0")}`;
}

function listRow(id: string, name: string, createdAt: string | Date = DEFAULT_TIME, updatedAt: string | Date = DEFAULT_TIME) {
  return { id, name, created_at: createdAt, updated_at: updatedAt };
}

function feedRow(opts: { listId: string; channelId: string; n: number; watched?: boolean; channelTitle?: string }) {
  return {
    list_id: opts.listId,
    video_id: videoId(opts.n),
    channel_id: opts.channelId,
    channel_title: opts.channelTitle ?? `Channel ${opts.channelId}`,
    title: `Video ${opts.n}`,
    published_at: DEFAULT_TIME,
    thumb_url: `https://img.example/${opts.n}.jpg`,
    watched_at: opts.watched ? DEFAULT_TIME : null,
    is_watched: opts.watched ?? false,
  };
}

// dispatches the summary queries and the feed list queries by SQL substring
function mockSummaryDb({
  lists = [],
  feedRows = [],
  channelRows = [],
  feedList,
}: {
  lists?: Record<string, unknown>[];
  feedRows?: Record<string, unknown>[];
  channelRows?: Record<string, unknown>[];
  feedList?: Record<string, unknown>;
}) {
  mockedQuery(vi.mocked(pool.query)).mockImplementation(async (sql) => {
    if (/from lists\s+where user_id/.test(sql)) {
      return mockQueryResult({ rows: lists });
    }
    if (sql.includes("channel_thumb_url")) {
      return mockQueryResult({ rows: channelRows });
    }
    if (sql.includes("join videos_cache")) {
      return mockQueryResult({ rows: feedRows });
    }
    if (sql.includes("select id, name from lists")) {
      return mockQueryResult({ rows: feedList ? [feedList] : [] });
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

type ListSpec = {
  name: string;
  unwatched: number;
  watched?: number;
  channels?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

// list i+1 gets channel UC<i> with unwatched rows first, then watched rows
function seedSummaryLists(specs: ListSpec[]) {
  const lists = specs.map((spec, i) =>
    listRow(listUuid(i + 1), spec.name, spec.createdAt ?? DEFAULT_TIME, spec.updatedAt ?? DEFAULT_TIME),
  );
  const feedRows = specs.flatMap((spec, i) => {
    if ((spec.channels ?? 1) === 0) return [];
    const total = spec.unwatched + (spec.watched ?? 0);
    return Array.from({ length: total }, (_, k) =>
      feedRow({ listId: listUuid(i + 1), channelId: `UC${i}`, n: i * 100 + k, watched: k >= spec.unwatched }),
    );
  });
  mockSummaryDb({ lists, feedRows });
}

function summaryResumeUrl(resume: string) {
  return `/api/lists/summary?${new URLSearchParams({ resume })}`;
}

describe("GET /api/lists/summary", () => {
  beforeEach(() => {
    mockAuthPasses = true;
    vi.mocked(pool.query).mockReset();
  });

  function buildAppWithFeed() {
    const app = express();
    app.use(express.json());
    app.use("/api/lists", listsRouter);
    app.use("/api/feed", feedRouter);
    return app;
  }

  it("counts match the list feed over every cached video", async () => {
    const aRows = Array.from({ length: 70 }, (_, i) =>
      feedRow({ listId: LIST_A, channelId: `UC${i % 3}`, n: i, watched: i < 15 }),
    );
    const bRows = Array.from({ length: 5 }, (_, i) =>
      feedRow({ listId: LIST_B, channelId: "UC9", n: 100 + i }),
    );
    mockSummaryDb({
      lists: [listRow(LIST_A, "A"), listRow(LIST_B, "B")],
      feedRows: [...aRows, ...bRows],
      feedList: { id: LIST_A, name: "A" },
    });
    const app = buildAppWithFeed();

    const summary = await request(app).get("/api/lists/summary");
    const feed = await request(app).get(`/api/feed/lists/${LIST_A}?limit=200`);

    expect(summary.status).toBe(200);
    expect(feed.status).toBe(200);
    const summaryA = summary.body.lists.find((l: { id: string }) => l.id === LIST_A);
    const summaryB = summary.body.lists.find((l: { id: string }) => l.id === LIST_B);
    const items = feed.body.items as { is_watched: boolean }[];
    expect(summaryA.videoCount).toBe(items.length);
    expect(summaryA.unwatchedCount).toBe(items.filter((item) => !item.is_watched).length);
    expect(summaryA.unwatchedCount).toBeGreaterThan(50);
    expect(summaryB.videoCount).toBe(5);

    const feedSql = vi
      .mocked(pool.query)
      .mock.calls.map(([sql]) => String(sql))
      .filter((sql) => sql.includes("join videos_cache"));
    expect(feedSql.length).toBeGreaterThan(0);
    expect(new Set(feedSql).size).toBe(1);
    expect(feedSql[0]).toContain("coalesce(v.live_broadcast_content, 'none') <> 'upcoming'");
    expect(feedSql[0]).toContain("coalesce(cp.excluded_shorts, false) = false");
    expect(feedSql[0]).toContain("v.duration_seconds > 60");
    // the query comment mentions enabled_all, so only an assignment is rejected
    expect(feedSql[0]).not.toMatch(/\benabled_all\s*=/);
  });

  const ORDER_CASES: { title: string; specs: ListSpec[]; expected: string[] }[] = [
    {
      title: "unwatched before caught up before no videos",
      specs: [
        { name: "empty", unwatched: 0, updatedAt: "2026-01-05T00:00:00Z" },
        { name: "caught up", unwatched: 0, watched: 3 },
        { name: "unwatched", unwatched: 1 },
      ],
      expected: ["unwatched", "caught up", "empty"],
    },
    {
      title: "a list with no channels sorts with the no videos tier",
      specs: [
        { name: "no channels", unwatched: 0, channels: 0, updatedAt: "2026-03-01T00:00:00Z" },
        { name: "empty channel", unwatched: 0, updatedAt: "2026-01-01T00:00:00Z" },
        { name: "caught up", unwatched: 0, watched: 2, updatedAt: "2025-01-01T00:00:00Z" },
      ],
      expected: ["caught up", "no channels", "empty channel"],
    },
    {
      title: "most unwatched first",
      specs: [
        { name: "two", unwatched: 2 },
        { name: "five", unwatched: 5 },
        { name: "one", unwatched: 1 },
      ],
      expected: ["five", "two", "one"],
    },
    {
      title: "equal unwatched then newer updated_at first",
      specs: [
        { name: "older update", unwatched: 3, updatedAt: "2026-01-01T00:00:00Z" },
        { name: "newer update", unwatched: 3, updatedAt: new Date("2026-02-01T00:00:00Z") },
      ],
      expected: ["newer update", "older update"],
    },
    {
      title: "equal updated_at then newer created_at first",
      specs: [
        { name: "older created", unwatched: 2, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { name: "newer created", unwatched: 2, createdAt: "2024-06-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      ],
      expected: ["newer created", "older created"],
    },
    {
      title: "a caught up list never outranks a list with 1 unwatched",
      specs: [
        { name: "caught up", unwatched: 0, watched: 40, updatedAt: "2026-05-01T00:00:00Z" },
        { name: "one unwatched", unwatched: 1, updatedAt: "2025-01-01T00:00:00Z" },
      ],
      expected: ["one unwatched", "caught up"],
    },
    {
      title: "8 lists give 6, the 2 lowest ranked dropped",
      specs: Array.from({ length: 8 }, (_, i) => ({ name: `L${i + 1}`, unwatched: i + 1 })),
      expected: ["L8", "L7", "L6", "L5", "L4", "L3"],
    },
  ];

  it.each(ORDER_CASES)("orders lists: $title", async ({ specs, expected }) => {
    seedSummaryLists(specs);

    const res = await request(buildApp()).get("/api/lists/summary");

    expect(res.status).toBe(200);
    expect(res.body.lists.map((l: { name: string }) => l.name)).toEqual(expected);
  });

  it("loads channels only for the kept list ids", async () => {
    seedSummaryLists(Array.from({ length: 8 }, (_, i) => ({ name: `L${i + 1}`, unwatched: i + 1 })));

    await request(buildApp()).get("/api/lists/summary");

    const channelCall = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) => String(sql).includes("channel_thumb_url"));
    expect(channelCall?.[1]).toEqual([
      USER_ID,
      [listUuid(8), listUuid(7), listUuid(6), listUuid(5), listUuid(4), listUuid(3)],
    ]);
  });

  it("scopes every summary query to the user", async () => {
    mockSummaryDb({
      lists: [listRow(LIST_A, "A"), listRow(LIST_B, "B")],
      feedRows: [
        feedRow({ listId: LIST_A, channelId: "UCa", n: 1 }),
        feedRow({ listId: LIST_B, channelId: "UCb", n: 2 }),
      ],
      channelRows: [{ list_id: LIST_A, channel_id: "UCa", channel_title: "Alpha", channel_thumb_url: null }],
    });

    const res = await request(buildApp()).get("/api/lists/summary");

    expect(res.status).toBe(200);
    const calls = vi.mocked(pool.query).mock.calls.map(([sql, params]) => ({ sql: String(sql), params }));
    const listsCall = calls.find(({ sql }) => /from lists\s+where user_id/.test(sql));
    const feedCall = calls.find(({ sql }) => sql.includes("join videos_cache"));
    const channelsCall = calls.find(({ sql }) => sql.includes("channel_thumb_url"));

    expect(listsCall?.sql).toContain("where user_id = $1");
    expect(listsCall?.params).toEqual([USER_ID]);
    expect(feedCall?.sql).toContain("any($2::uuid[])");
    expect(feedCall?.params).toEqual([USER_ID, [LIST_A, LIST_B]]);
    expect(channelsCall?.sql).toContain("join user_subscriptions");
    expect(channelsCall?.sql).toContain("and l.user_id = $1");
    expect(channelsCall?.params).toEqual([USER_ID, [LIST_A, LIST_B]]);
  });

  describe("featured video", () => {
    // one channel, so the queue order is the row order
    function seedOneList(rows: Record<string, unknown>[]) {
      mockSummaryDb({ lists: [listRow(LIST_A, "A")], feedRows: rows });
    }

    function unwatchedRows(count: number) {
      return Array.from({ length: count }, (_, i) => feedRow({ listId: LIST_A, channelId: "UC1", n: i }));
    }

    it("resume inside the first 50 gives that video, kind resume", async () => {
      seedOneList(unwatchedRows(60));

      const res = await request(buildApp()).get(summaryResumeUrl(`${LIST_A}:${videoId(10)}`));

      expect(res.status).toBe(200);
      expect(res.body.lists[0].featuredVideo).toEqual({
        videoId: videoId(10),
        title: "Video 10",
        thumbUrl: "https://img.example/10.jpg",
        kind: "resume",
      });
    });

    it("resume at index 50 or beyond gives kind next", async () => {
      seedOneList(unwatchedRows(60));

      const at50 = await request(buildApp()).get(summaryResumeUrl(`${LIST_A}:${videoId(50)}`));
      const at59 = await request(buildApp()).get(summaryResumeUrl(`${LIST_A}:${videoId(59)}`));

      expect(at50.status).toBe(200);
      expect(at50.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(0), kind: "next" });
      expect(at59.status).toBe(200);
      expect(at59.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(0), kind: "next" });
    });

    it("resume for a video not in the list gives kind next", async () => {
      seedOneList(unwatchedRows(60));

      const res = await request(buildApp()).get(summaryResumeUrl(`${LIST_A}:zzzzzzzzzzz`));

      expect(res.status).toBe(200);
      expect(res.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(0), kind: "next" });
    });

    it("a hint for a list id not in the user's lists is ignored", async () => {
      // lookup only, user scoping is pinned by "scopes every summary query to the user"
      seedOneList(unwatchedRows(60));

      const res = await request(buildApp()).get(summaryResumeUrl(`${OTHER_USER_LIST}:${videoId(10)}`));

      expect(res.status).toBe(200);
      expect(res.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(0), kind: "next" });
    });

    it("malformed entries are ignored", async () => {
      seedOneList(unwatchedRows(60));
      const bad = [
        LIST_A,
        `${LIST_A}:${videoId(10).slice(0, 10)}`,
        `${LIST_A}:${videoId(10)}:extra`,
        `:${videoId(10)}`,
        `${LIST_A}:`,
        `not-a-uuid:${videoId(10)}`,
        `${LIST_A}:${videoId(10)}!`,
      ];

      for (const entry of bad) {
        const res = await request(buildApp()).get(summaryResumeUrl(entry));
        expect(res.status).toBe(200);
        expect(res.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(0), kind: "next" });
      }
    });

    it("a repeated resume key is ignored", async () => {
      seedOneList(unwatchedRows(60));
      const first = encodeURIComponent(`${LIST_A}:${videoId(10)}`);
      const second = encodeURIComponent(`${LIST_A}:${videoId(11)}`);

      const res = await request(buildApp()).get(`/api/lists/summary?resume=${first}&resume=${second}`);

      expect(res.status).toBe(200);
      expect(res.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(0), kind: "next" });
    });

    it("an uppercase list id in the hint matches", async () => {
      seedOneList(unwatchedRows(60));

      const res = await request(buildApp()).get(summaryResumeUrl(`${LIST_A.toUpperCase()}:${videoId(10)}`));

      expect(res.status).toBe(200);
      expect(res.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(10), kind: "resume" });
    });

    it("first unwatched past index 50 gives the first item, kind next", async () => {
      seedOneList(
        Array.from({ length: 60 }, (_, i) => feedRow({ listId: LIST_A, channelId: "UC1", n: i, watched: i < 50 })),
      );

      const res = await request(buildApp()).get("/api/lists/summary");

      expect(res.status).toBe(200);
      expect(res.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(0), kind: "next" });
    });

    it("first unwatched inside the first 50 gives that video, kind next", async () => {
      seedOneList(
        Array.from({ length: 60 }, (_, i) => feedRow({ listId: LIST_A, channelId: "UC1", n: i, watched: i < 3 })),
      );

      const res = await request(buildApp()).get("/api/lists/summary");

      expect(res.status).toBe(200);
      expect(res.body.lists[0]).toMatchObject({ videoCount: 60, unwatchedCount: 57 });
      expect(res.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(3), kind: "next" });
    });

    it("featured follows round robin order across channels", async () => {
      mockSummaryDb({
        lists: [listRow(LIST_A, "A")],
        feedRows: [
          feedRow({ listId: LIST_A, channelId: "UCa", n: 1, watched: true }),
          feedRow({ listId: LIST_A, channelId: "UCa", n: 2 }),
          feedRow({ listId: LIST_A, channelId: "UCb", n: 3 }),
        ],
      });

      const res = await request(buildApp()).get("/api/lists/summary");

      expect(res.status).toBe(200);
      expect(res.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(3), kind: "next" });
    });

    it("caught up gives the first item, kind next", async () => {
      seedOneList(
        Array.from({ length: 60 }, (_, i) => feedRow({ listId: LIST_A, channelId: "UC1", n: i, watched: true })),
      );

      const res = await request(buildApp()).get("/api/lists/summary");

      expect(res.status).toBe(200);
      expect(res.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(0), kind: "next" });
    });

    it("no rows gives featuredVideo null", async () => {
      seedOneList([]);

      const res = await request(buildApp()).get("/api/lists/summary");

      expect(res.status).toBe(200);
      expect(res.body.lists[0].featuredVideo).toBeNull();
    });

    it("only the first 100 raw entries are considered", async () => {
      seedOneList(unwatchedRows(60));
      const junk = Array.from({ length: 100 }, () => "junk");

      const late = await request(buildApp()).get(summaryResumeUrl([...junk, `${LIST_A}:${videoId(10)}`].join(",")));
      const early = await request(buildApp()).get(summaryResumeUrl([`${LIST_A}:${videoId(10)}`, ...junk].join(",")));

      expect(late.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(0), kind: "next" });
      expect(early.body.lists[0].featuredVideo).toMatchObject({ videoId: videoId(10), kind: "resume" });
    });

    it("no hint value appears in any SQL text or params", async () => {
      seedOneList(unwatchedRows(60));

      const res = await request(buildApp()).get(summaryResumeUrl(`${LIST_A}:${videoId(10)}`));

      expect(res.status).toBe(200);
      expect(JSON.stringify(vi.mocked(pool.query).mock.calls)).not.toContain(videoId(10));
    });
  });

  it("returns an empty list and runs one query when the user has no lists", async () => {
    mockSummaryDb({ lists: [] });

    const res = await request(buildApp()).get("/api/lists/summary");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lists: [] });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("maps channels in returned order and keeps list shape", async () => {
    mockSummaryDb({
      lists: [listRow(LIST_A, "A")],
      feedRows: [feedRow({ listId: LIST_A, channelId: "UCa", n: 1 })],
      channelRows: [
        { list_id: LIST_A, channel_id: "UCb", channel_title: "Beta", channel_thumb_url: "https://img.example/b.jpg" },
        { list_id: LIST_A, channel_id: "UCa", channel_title: "Alpha", channel_thumb_url: null },
      ],
    });

    const res = await request(buildApp()).get("/api/lists/summary");

    expect(res.status).toBe(200);
    expect(res.body.lists[0].channels).toEqual([
      { channelId: "UCb", title: "Beta", thumbUrl: "https://img.example/b.jpg" },
      { channelId: "UCa", title: "Alpha", thumbUrl: null },
    ]);
    expect(Object.keys(res.body.lists[0]).sort()).toEqual(
      ["channels", "featuredVideo", "id", "name", "unwatchedCount", "videoCount"],
    );
  });

  it("a list with channels but no video rows gets zero counts and null featuredVideo", async () => {
    mockSummaryDb({
      lists: [listRow(LIST_A, "A")],
      feedRows: [],
      channelRows: [
        { list_id: LIST_A, channel_id: "UCa", channel_title: "Alpha", channel_thumb_url: null },
      ],
    });

    const res = await request(buildApp()).get("/api/lists/summary");

    expect(res.status).toBe(200);
    expect(res.body.lists[0]).toMatchObject({
      videoCount: 0,
      unwatchedCount: 0,
      featuredVideo: null,
      channels: [{ channelId: "UCa", title: "Alpha", thumbUrl: null }],
    });
  });

  it("a list with no channel rows still appears with channels []", async () => {
    mockSummaryDb({
      lists: [listRow(LIST_A, "A"), listRow(LIST_B, "B")],
      feedRows: [],
      channelRows: [
        { list_id: LIST_A, channel_id: "UCa", channel_title: "Alpha", channel_thumb_url: null },
      ],
    });

    const res = await request(buildApp()).get("/api/lists/summary");

    expect(res.status).toBe(200);
    const listB = res.body.lists.find((l: { id: string }) => l.id === LIST_B);
    expect(listB).toBeDefined();
    expect(listB.channels).toEqual([]);
  });

  it("returns 401 AUTH_REQUIRED without touching the database when unauthenticated", async () => {
    mockAuthPasses = false;

    const res = await request(buildApp()).get("/api/lists/summary");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "AUTH_REQUIRED" });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("is routed before /:listId", async () => {
    mockSummaryDb({ lists: [] });

    const res = await request(buildApp()).get("/api/lists/summary");

    expect(res.status).toBe(200);
  });
});

describe("GET /api/lists", () => {
  beforeEach(() => {
    mockAuthPasses = true;
    vi.mocked(pool.query).mockReset();
  });

  it("returns lists with channelCount and camelCase dates, unchanged", async () => {
    const createdAt = "2025-01-01T00:00:00.000Z";
    const updatedAt = "2025-02-01T00:00:00.000Z";
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({
        rows: [{ id: LIST_A, name: "A", created_at: createdAt, updated_at: updatedAt, channel_count: "3" }],
      }),
    );

    const res = await request(buildApp()).get("/api/lists");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      lists: [{ id: LIST_A, name: "A", channelCount: 3, createdAt, updatedAt }],
    });
    const [sql] = vi.mocked(pool.query).mock.calls[0];
    expect(String(sql)).toContain("count(lc.channel_id)");
  });
});
