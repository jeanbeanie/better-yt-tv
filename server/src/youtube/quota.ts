import { pool } from "../db/pool.js";

export const DAILY_QUOTA_BUDGET = 10_000;
export const HISTORY_WINDOW_DAYS = 365;

// real array because the type alone vanishes at runtime so cant be checked against
export const YOUTUBE_QUOTA_CALL_TYPES = [
  "channels.list",
  "playlistItems.list",
  "subscriptions.list",
] as const;
export type YoutubeQuotaCallType = (typeof YOUTUBE_QUOTA_CALL_TYPES)[number];

export type QuotaCallContext = {
  action?: string;
  userId?: string;
  requestGroupId?: string;
};

// logs one row per call, before the resp.ok check (quota bills on receipt)
// fails open so a logging error never breaks a real sync/refresh
export async function recordQuotaUsage(
  callType: YoutubeQuotaCallType,
  units: number,
  context: QuotaCallContext = {},
): Promise<void> {
  try {
    await pool.query(
      `insert into youtube_quota_usage (call_type, units, action, user_id, request_group_id) values ($1, $2, $3, $4, $5)`,
      [callType, units, context.action ?? null, context.userId ?? null, context.requestGroupId ?? null],
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

export type QuotaActionGroup = {
  action: string | null;
  callType: string;
  units: number;
  requestGroupId: string | null;
  userEmail: string | null;
  firstAt: string;
  lastAt: string;
};

// one line per action, call type, user, and run on one pacific calendar date
// reuses the same expression index as getQuotaHistory
export async function getQuotaGroupsOnDate(date: string): Promise<QuotaActionGroup[]> {
  const result = await pool.query(
    `
    select
      q.action,
      q.call_type,
      sum(q.units)::int as units,
      q.request_group_id,
      q.user_id,
      min(u.email) as user_email,
      min(q.called_at) as first_at,
      max(q.called_at) as last_at
    from youtube_quota_usage q
    left join users u on u.id = q.user_id
    where timezone('America/Los_Angeles', q.called_at)::date = $1::date
    group by q.action, q.call_type, q.user_id, q.request_group_id
    order by max(q.called_at) desc, q.call_type
    `,
    [date],
  );

  return result.rows.map((row) => ({
    action: row.action,
    callType: row.call_type,
    units: row.units,
    requestGroupId: row.request_group_id,
    userEmail: row.user_email,
    firstAt: new Date(row.first_at).toISOString(),
    lastAt: new Date(row.last_at).toISOString(),
  }));
}

// raw calls in one group, newest first
// is not distinct from is null safe equality, so old rows with a null
// action, user_id, or request_group_id still match through this query
export async function getQuotaCallsInGroup(args: {
  date: string;
  action: string | null;
  callType: string;
  userId: string | null;
  requestGroupId: string | null;
}): Promise<QuotaCall[]> {
  const result = await pool.query(
    `
    select call_type, units, called_at
    from youtube_quota_usage
    where timezone('America/Los_Angeles', called_at)::date = $1::date
      and call_type = $2
      and action is not distinct from $3
      and user_id is not distinct from $4
      and request_group_id is not distinct from $5
    order by called_at desc
    `,
    [args.date, args.callType, args.action, args.userId, args.requestGroupId],
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
