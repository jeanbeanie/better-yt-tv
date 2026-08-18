import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

const { pool } = await import("../db/pool.js");
const { recordQuotaUsage, getQuotaHistory, summarizeToday, DAILY_QUOTA_BUDGET } =
  await import("./quota.js");

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

  function mockRows(historyRows: any[], todayDate: Date) {
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
        { usage_date: new Date("2026-08-17"), call_type: "channels.list", units: 4 },
        { usage_date: new Date("2026-08-17"), call_type: "playlistItems.list", units: 4 },
        { usage_date: new Date("2026-08-16"), call_type: "subscriptions.list", units: 1 },
      ],
      new Date("2026-08-17"),
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
    mockRows([], new Date("2026-08-17"));

    const { days, todayDate } = await getQuotaHistory();

    expect(days).toEqual([]);
    expect(todayDate).toBe("2026-08-17");
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
