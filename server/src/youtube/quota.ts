import { pool } from "../db/pool.js";

export const DAILY_QUOTA_BUDGET = 10_000;
export const HISTORY_WINDOW_DAYS = 365;

export type YoutubeQuotaCallType =
  | "channels.list"
  | "playlistItems.list"
  | "subscriptions.list";

// logs one row per call, before the resp.ok check (quota bills on receipt)
// fails open so a logging error never breaks a real sync/refresh
export async function recordQuotaUsage(
  callType: YoutubeQuotaCallType,
  units: number,
): Promise<void> {
  try {
    await pool.query(
      `insert into youtube_quota_usage (call_type, units) values ($1, $2)`,
      [callType, units],
    );
  } catch (err) {
    console.error("Failed to record YouTube quota usage:", err);
  }
}

export type QuotaHistoryDay = {
  date: string; // YYYY-MM-DD, Pacific calendar date
  total: number;
  breakdown: { callType: string; units: number }[];
};

export type QuotaSummary = {
  used: number;
  remaining: number;
  budget: number;
  breakdown: { callType: string; units: number }[];
};

// history grouped by pacific date and call type, plus postgres's own
// today, so dst/timezone math stays in postgres, not app code
export async function getQuotaHistory(): Promise<{
  days: QuotaHistoryDay[];
  todayDate: string;
}> {
  const [historyResult, todayResult] = await Promise.all([
    pool.query(
      `
      select
        to_char(timezone('America/Los_Angeles', called_at)::date, 'YYYY-MM-DD') as usage_date,
        call_type,
        sum(units)::int as units
      from youtube_quota_usage
      where called_at > now() - ($1 || ' days')::interval
      group by usage_date, call_type
      order by usage_date desc, call_type
      `,
      [HISTORY_WINDOW_DAYS],
    ),
    pool.query(
      `select to_char(timezone('America/Los_Angeles', now())::date, 'YYYY-MM-DD') as today_date`,
    ),
  ]);

  const byDate = new Map<string, QuotaHistoryDay>();
  for (const row of historyResult.rows) {
    const date = row.usage_date as string;
    if (!byDate.has(date)) {
      byDate.set(date, { date, total: 0, breakdown: [] });
    }
    const day = byDate.get(date)!;
    day.breakdown.push({ callType: row.call_type, units: row.units });
    day.total += row.units;
  }

  const todayDate = todayResult.rows[0].today_date as string;

  return { days: [...byDate.values()], todayDate };
}

export type QuotaCall = {
  calledAt: string;
  callType: string;
  units: number;
};

// individual calls for one pacific calendar date, newest first
// reuses the youtube_quota_usage_usage_date_idx expression index
export async function getQuotaCallsOnDate(date: string): Promise<QuotaCall[]> {
  const result = await pool.query(
    `
    select call_type, units, called_at
    from youtube_quota_usage
    where timezone('America/Los_Angeles', called_at)::date = $1::date
    order by called_at desc
    `,
    [date],
  );

  return result.rows.map((row) => ({
    calledAt: (row.called_at as Date).toISOString(),
    callType: row.call_type,
    units: row.units,
  }));
}

// pure, no db call: looks up today in an already fetched list
// requires `days` from an unpaginated fetch (today is always first)
export function summarizeToday(
  days: QuotaHistoryDay[],
  todayDate: string,
  budget: number = DAILY_QUOTA_BUDGET,
): QuotaSummary {
  const today = days.find((d) => d.date === todayDate);
  const used = today?.total ?? 0;

  return {
    used,
    remaining: Math.max(budget - used, 0),
    budget,
    breakdown: today?.breakdown ?? [],
  };
}
