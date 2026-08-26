import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPool, mockedQuery, mockQueryResult } from "../testUtils/pgMocks.js";

vi.mock("../db/pool.js", () => ({
  pool: createMockPool(),
}));

const { pool } = await import("../db/pool.js");
const {
  recordQuotaUsage,
  getQuotaHistory,
  getQuotaGroupsOnDate,
  getQuotaCallsInGroup,
  summarizeToday,
  DAILY_QUOTA_BUDGET,
  HISTORY_WINDOW_DAYS,
} = await import("./quota.js");

describe("recordQuotaUsage", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("inserts one row with the given call type and units, and nulls when no context is given", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [], rowCount: 1 }),
    );

    await recordQuotaUsage("channels.list", 1);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("insert into youtube_quota_usage"),
      ["channels.list", 1, null, null, null],
    );
  });

  it("inserts action, userId, and requestGroupId when a context is given", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [], rowCount: 1 }),
    );

    await recordQuotaUsage("channels.list", 1, {
      action: "refresh-all-cache",
      userId: "user-1",
      requestGroupId: "group-1",
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("insert into youtube_quota_usage"),
      ["channels.list", 1, "refresh-all-cache", "user-1", "group-1"],
    );
  });

  it("swallows a rejected query instead of throwing", async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error("connection reset"));

    await expect(recordQuotaUsage("channels.list", 1)).resolves.toBeUndefined();
  });
});

describe("getQuotaHistory", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  type HistoryRow = { usage_date: string; call_type: string; units: number };

  function mockRows(historyRows: HistoryRow[], todayDate: string) {
    mockedQuery(vi.mocked(pool.query)).mockImplementation(async (sql) => {
      if (sql.includes("group by usage_date")) {
        return mockQueryResult({ rows: historyRows });
      }
      return mockQueryResult({ rows: [{ today_date: todayDate }] });
    });
  }

  it("groups multiple call types on the same day into one entry", async () => {
    mockRows(
      [
        { usage_date: "2026-08-17", call_type: "channels.list", units: 4 },
        { usage_date: "2026-08-17", call_type: "playlistItems.list", units: 4 },
        { usage_date: "2026-08-16", call_type: "subscriptions.list", units: 1 },
      ],
      "2026-08-17",
    );

    const { days, todayDate } = await getQuotaHistory();

    expect(todayDate).toBe("2026-08-17");
    expect(days).toEqual([
      {
        date: "2026-08-17",
        total: 8,
        breakdown: [
          { callType: "channels.list", units: 4 },
          { callType: "playlistItems.list", units: 4 },
        ],
      },
      {
        date: "2026-08-16",
        total: 1,
        breakdown: [{ callType: "subscriptions.list", units: 1 }],
      },
    ]);
  });

  it("returns an empty list when the table has no rows", async () => {
    mockRows([], "2026-08-17");

    const { days, todayDate } = await getQuotaHistory();

    expect(days).toEqual([]);
    expect(todayDate).toBe("2026-08-17");
  });

  it("bounds the history query to HISTORY_WINDOW_DAYS", async () => {
    mockRows([], "2026-08-17");

    await getQuotaHistory();

    const historyCall = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) => String(sql).includes("group by usage_date"));
    expect(historyCall![0]).toContain("where called_at >");
    expect(historyCall![1]).toEqual([HISTORY_WINDOW_DAYS]);
  });
});

describe("getQuotaGroupsOnDate", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("filters on the pacific-date expression, passing the date through as a parameter", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [] }),
    );

    await getQuotaGroupsOnDate("2026-08-17");

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("timezone('America/Los_Angeles', q.called_at)::date = $1::date"),
      ["2026-08-17"],
    );
  });

  it("keeps two users running the same action and call type on one day as separate rows", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({
      rows: [
        {
          action: "refresh-all-cache",
          call_type: "playlistItems.list",
          units: 900,
          request_group_id: "group-a",
          user_id: "user-1",
          user_email: "one@example.com",
          first_at: new Date("2026-08-17T18:00:00.000Z"),
          last_at: new Date("2026-08-17T18:05:00.000Z"),
        },
        {
          action: "refresh-all-cache",
          call_type: "playlistItems.list",
          units: 400,
          request_group_id: "group-b",
          user_id: "user-2",
          user_email: "two@example.com",
          first_at: new Date("2026-08-17T19:00:00.000Z"),
          last_at: new Date("2026-08-17T19:02:00.000Z"),
        },
      ],
    }));

    const groups = await getQuotaGroupsOnDate("2026-08-17");

    expect(groups).toEqual([
      {
        action: "refresh-all-cache",
        callType: "playlistItems.list",
        units: 900,
        requestGroupId: "group-a",
        userEmail: "one@example.com",
        firstAt: "2026-08-17T18:00:00.000Z",
        lastAt: "2026-08-17T18:05:00.000Z",
      },
      {
        action: "refresh-all-cache",
        callType: "playlistItems.list",
        units: 400,
        requestGroupId: "group-b",
        userEmail: "two@example.com",
        firstAt: "2026-08-17T19:00:00.000Z",
        lastAt: "2026-08-17T19:02:00.000Z",
      },
    ]);
  });

  it("passes through a null action for pre migration rows", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({
      rows: [
        {
          action: null,
          call_type: "channels.list",
          units: 40,
          request_group_id: null,
          user_id: null,
          user_email: null,
          first_at: new Date("2026-08-17T10:00:00.000Z"),
          last_at: new Date("2026-08-17T10:00:00.000Z"),
        },
      ],
    }));

    const groups = await getQuotaGroupsOnDate("2026-08-17");

    expect(groups[0].action).toBeNull();
    expect(groups[0].requestGroupId).toBeNull();
    expect(groups[0].userEmail).toBeNull();
  });

  it("gives two same-day runs of the same action by the same user separate lines", async () => {
    // regression test: two refresh-all-cache runs differ only by request_group_id
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({
      rows: [
        {
          action: "refresh-all-cache",
          call_type: "playlistItems.list",
          units: 500,
          request_group_id: "run-2",
          user_id: "user-1",
          user_email: "one@example.com",
          first_at: new Date("2026-08-17T20:00:00.000Z"),
          last_at: new Date("2026-08-17T20:05:00.000Z"),
        },
        {
          action: "refresh-all-cache",
          call_type: "playlistItems.list",
          units: 300,
          request_group_id: "run-1",
          user_id: "user-1",
          user_email: "one@example.com",
          first_at: new Date("2026-08-17T09:00:00.000Z"),
          last_at: new Date("2026-08-17T09:03:00.000Z"),
        },
      ],
    }));

    const groups = await getQuotaGroupsOnDate("2026-08-17");

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.requestGroupId)).toEqual(["run-2", "run-1"]);
    expect(groups.map((g) => g.units)).toEqual([500, 300]);
  });
});

describe("getQuotaCallsInGroup", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("filters on date, call type, action, user, and run, in that parameter order", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [] }),
    );

    await getQuotaCallsInGroup({
      date: "2026-08-17",
      callType: "playlistItems.list",
      action: "refresh-all-cache",
      userId: "user-1",
      requestGroupId: "group-a",
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("is not distinct from"),
      ["2026-08-17", "playlistItems.list", "refresh-all-cache", "user-1", "group-a"],
    );
  });

  it("passes null action, userId, and requestGroupId through for pre migration rows", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [] }),
    );

    await getQuotaCallsInGroup({
      date: "2026-08-17",
      callType: "channels.list",
      action: null,
      userId: null,
      requestGroupId: null,
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      ["2026-08-17", "channels.list", null, null, null],
    );
  });

  it("maps rows to camelCase with an ISO-stamped calledAt, newest first as returned by postgres", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({
      rows: [
        { call_type: "channels.list", units: 1, called_at: new Date("2026-08-17T20:00:00.000Z") },
        { call_type: "channels.list", units: 1, called_at: new Date("2026-08-17T09:00:00.000Z") },
      ],
    }));

    const calls = await getQuotaCallsInGroup({
      date: "2026-08-17",
      callType: "channels.list",
      action: null,
      userId: null,
      requestGroupId: null,
    });

    expect(calls).toEqual([
      { calledAt: "2026-08-17T20:00:00.000Z", callType: "channels.list", units: 1 },
      { calledAt: "2026-08-17T09:00:00.000Z", callType: "channels.list", units: 1 },
    ]);
  });
});

describe("summarizeToday", () => {
  it("returns the matching day's totals", () => {
    const days = [
      { date: "2026-08-17", total: 250, breakdown: [{ callType: "channels.list", units: 250 }] },
      { date: "2026-08-16", total: 10, breakdown: [{ callType: "subscriptions.list", units: 10 }] },
    ];

    expect(summarizeToday(days, "2026-08-17")).toEqual({
      used: 250,
      remaining: DAILY_QUOTA_BUDGET - 250,
      budget: DAILY_QUOTA_BUDGET,
      breakdown: [{ callType: "channels.list", units: 250 }],
    });
  });

  it("defaults to zero when today has no rows yet", () => {
    expect(summarizeToday([], "2026-08-17")).toEqual({
      used: 0,
      remaining: DAILY_QUOTA_BUDGET,
      budget: DAILY_QUOTA_BUDGET,
      breakdown: [],
    });
  });

  it("clamps remaining at zero when usage exceeds budget", () => {
    const days = [
      { date: "2026-08-17", total: DAILY_QUOTA_BUDGET + 500, breakdown: [] },
    ];

    expect(summarizeToday(days, "2026-08-17").remaining).toBe(0);
  });
});
