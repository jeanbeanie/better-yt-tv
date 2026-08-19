import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

const { pool } = await import("../db/pool.js");
const {
  recordQuotaUsage,
  getQuotaHistory,
  getQuotaCallsOnDate,
  summarizeToday,
  DAILY_QUOTA_BUDGET,
  HISTORY_WINDOW_DAYS,
} = await import("./quota.js");

describe("recordQuotaUsage", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("inserts one row with the given call type and units", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    await recordQuotaUsage("channels.list", 1);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("insert into youtube_quota_usage"),
      ["channels.list", 1],
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

  function mockRows(historyRows: any[], todayDate: string) {
    vi.mocked(pool.query).mockImplementation(async (sql: any) => {
      if (String(sql).includes("group by usage_date")) {
        return { rows: historyRows } as any;
      }
      return { rows: [{ today_date: todayDate }] } as any;
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

describe("getQuotaCallsOnDate", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("filters on the pacific-date expression, passing the date through as a parameter", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

    await getQuotaCallsOnDate("2026-08-17");

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("timezone('America/Los_Angeles', called_at)::date = $1::date"),
      ["2026-08-17"],
    );
  });

  it("maps rows to camelCase with an ISO-stamped calledAt, newest first as returned by postgres", async () => {
    // simulates a call made late in the UTC evening that postgres has already
    // bucketed onto the requested pacific date via the timezone() expression
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        { call_type: "channels.list", units: 1, called_at: new Date("2026-08-18T05:30:00.000Z") },
        { call_type: "playlistItems.list", units: 4, called_at: new Date("2026-08-18T02:00:00.000Z") },
      ],
    } as any);

    const calls = await getQuotaCallsOnDate("2026-08-17");

    expect(calls).toEqual([
      { calledAt: "2026-08-18T05:30:00.000Z", callType: "channels.list", units: 1 },
      { calledAt: "2026-08-18T02:00:00.000Z", callType: "playlistItems.list", units: 4 },
    ]);
  });

  it("returns an empty array when no calls exist for the date", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

    expect(await getQuotaCallsOnDate("2026-08-17")).toEqual([]);
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
