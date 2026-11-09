import { pool } from "../db/pool.js";
import { recordQuotaUsage, type QuotaCallContext } from "./quota.js";
import type {
  YoutubeVideo,
  YoutubeVideosListResponse,
} from "./apiTypes.js";

const RSS_FETCH_TIMEOUT_MS = 5000;
const RSS_CONCURRENCY = 5;

const VIDEO_ID_PATTERN = /<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/g;

// RSS is free and unauthenticated but served unreliably, callers must tolerate failure
export async function fetchChannelRssVideoIds(channelId: string): Promise<string[]> {
  const url = new URL("https://www.youtube.com/feeds/videos.xml");
  url.searchParams.set("channel_id", channelId);

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS),
  });

  // body omitted, outages return HTML error pages
  if (!resp.ok) {
    throw new Error(`YouTube RSS fetch failed: ${resp.status}`);
  }

  const xml = await resp.text();
  return Array.from(xml.matchAll(VIDEO_ID_PATTERN), (match) => match[1]);
}

const RSS_TIME_BUDGET_MS = 45_000;

// an outage fails every channel, stop instead of waiting on each timeout
export async function fetchRssIdsForChannels(
  channelIds: string[],
  budgetMs: number = RSS_TIME_BUDGET_MS,
): Promise<{
  videoIds: string[];
  attemptedChannelIds: string[];
  failedChannels: number;
}> {
  const uniqueChannelIds = [...new Set(channelIds)];
  const videoIds = new Set<string>();
  const attemptedChannelIds: string[] = [];
  let failedChannels = 0;
  const startedAt = Date.now();

  for (let i = 0; i < uniqueChannelIds.length; i += RSS_CONCURRENCY) {
    // a long pass would outlast request timeouts, unfetched channels stay due for the next call
    if (i > 0 && Date.now() - startedAt >= budgetMs) break;

    const group = uniqueChannelIds.slice(i, i + RSS_CONCURRENCY);
    attemptedChannelIds.push(...group);

    const results = await Promise.allSettled(
      group.map((channelId) => fetchChannelRssVideoIds(channelId)),
    );

    let groupFailed = 0;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        for (const id of result.value) videoIds.add(id);
        return;
      }
      groupFailed++;
      console.error(`Failed to fetch RSS for channel ${group[index]}:`, result.reason);
    });
    failedChannels += groupFailed;

    if (groupFailed === group.length) break;
  }

  return { videoIds: [...videoIds], attemptedChannelIds, failedChannels };
}

// videos.list accepts at most 50 ids per call
const VIDEOS_LIST_MAX_IDS = 50;

type LiveBroadcastContent = "live" | "upcoming" | "none";

type VideoRow = {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: Date;
  thumbUrl: string | null;
  liveBroadcastContent: LiveBroadcastContent;
  scheduledStartTime: Date | null;
  actualStartTime: Date | null;
};

// returns null for missing or unparseable values
function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// drops items missing the fields the upsert needs
function toVideoRow(item: YoutubeVideo): VideoRow | null {
  const videoId = item.id;
  const channelId = item.snippet?.channelId;
  const title = item.snippet?.title;
  const publishedAt = parseDate(item.snippet?.publishedAt);
  if (!videoId || !channelId || !title || !publishedAt) {
    return null;
  }

  return {
    videoId,
    channelId,
    title,
    publishedAt,
    thumbUrl:
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      null,
    liveBroadcastContent:
      item.snippet?.liveBroadcastContent === "live" ||
      item.snippet?.liveBroadcastContent === "upcoming"
        ? item.snippet.liveBroadcastContent
        : "none",
    scheduledStartTime: parseDate(item.liveStreamingDetails?.scheduledStartTime),
    actualStartTime: parseDate(item.liveStreamingDetails?.actualStartTime),
  };
}

async function fetchVideoDetails(args: {
  accessToken: string;
  videoIds: string[];
  quotaContext?: QuotaCallContext;
}): Promise<YoutubeVideo[] | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,liveStreamingDetails");
  url.searchParams.set("id", args.videoIds.join(","));

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
    },
  });

  // quota bills on receipt, logged before the ok check
  await recordQuotaUsage("videos.list", 1, args.quotaContext ?? {});

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`YouTube video details fetch failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as YoutubeVideosListResponse;
  // no items array means no information, not an empty answer
  return Array.isArray(data?.items) ? data.items : null;
}

// update only the live columns on conflict, changing published_at would reorder the /all feed
async function upsertVideoRows(rows: VideoRow[]): Promise<void> {
  await pool.query(
    `
    insert into videos_cache (
      video_id,
      channel_id,
      title,
      published_at,
      thumb_url,
      live_broadcast_content,
      scheduled_start_time,
      actual_start_time,
      fetched_at
    )
    select t.*, now()
    from unnest(
      $1::text[], $2::text[], $3::text[], $4::timestamptz[], $5::text[],
      $6::text[], $7::timestamptz[], $8::timestamptz[]
    ) as t(
      video_id,
      channel_id,
      title,
      published_at,
      thumb_url,
      live_broadcast_content,
      scheduled_start_time,
      actual_start_time
    )
    on conflict (video_id) do update
      set live_broadcast_content = excluded.live_broadcast_content,
          scheduled_start_time = excluded.scheduled_start_time,
          actual_start_time = excluded.actual_start_time
    `,
    [
      rows.map((row) => row.videoId),
      rows.map((row) => row.channelId),
      rows.map((row) => row.title),
      rows.map((row) => row.publishedAt),
      rows.map((row) => row.thumbUrl),
      rows.map((row) => row.liveBroadcastContent),
      rows.map((row) => row.scheduledStartTime),
      rows.map((row) => row.actualStartTime),
    ],
  );
}

// deleted or private videos are never returned again, so retire their live status
async function retireAbsentLiveRows(absentIds: string[]): Promise<void> {
  await pool.query(
    `
    update videos_cache
    set live_broadcast_content = 'none'
    where video_id = any($1::text[])
      and live_broadcast_content in ('live', 'upcoming')
    `,
    [absentIds],
  );
}

// Fetch live status for video ids from YouTube and save it into videos_cache
// returns the number of rows saved, ids YouTube does not return are not written
export async function classifyVideos(args: {
  accessToken: string;
  videoIds: string[];
  quotaContext?: QuotaCallContext;
}): Promise<number> {
  // duplicate ids in one multi-row upsert make postgres reject the statement
  const uniqueIds = [...new Set(args.videoIds)];

  let saved = 0;
  for (let i = 0; i < uniqueIds.length; i += VIDEOS_LIST_MAX_IDS) {
    const batchIds = uniqueIds.slice(i, i + VIDEOS_LIST_MAX_IDS);
    const items = await fetchVideoDetails({
      accessToken: args.accessToken,
      videoIds: batchIds,
      quotaContext: args.quotaContext,
    });
    if (items === null) {
      console.error(`videos.list response had no items array, skipped batch of ${batchIds.length} ids`);
      continue;
    }

    const returnedIds = new Set(items.map((item) => item.id));
    const absentIds = batchIds.filter((id) => !returnedIds.has(id));
    if (absentIds.length > 0) {
      await retireAbsentLiveRows(absentIds);
    }

    // repeated ids in one response make the upsert fail
    const rowsById = new Map<string, VideoRow>();
    for (const item of items) {
      const row = toVideoRow(item);
      if (row && !rowsById.has(row.videoId)) {
        rowsById.set(row.videoId, row);
      }
    }
    const rows = [...rowsById.values()];
    if (rows.length === 0) {
      continue;
    }

    await upsertVideoRows(rows);
    saved += rows.length;
  }

  return saved;
}

const CLASSIFY_RECENT_DAYS = 14;

// Pick video ids to pass to classifyVideos, capped at limit
// C: cached channel videos that are live or upcoming, always first
// A: rss ids not cached or cached without a status
// B: recent cached channel videos without a status
// uncached rss ids have no published_at, nulls first ranks them as newest
export async function findVideoIdsToClassify(
  channelIds: string[],
  rssIds: string[],
  limit: number,
): Promise<string[]> {
  if (limit <= 0) {
    return [];
  }
  // dedupe rssIds before the query
  const uniqueRssIds = [...new Set(rssIds)];
  if (channelIds.length === 0 && uniqueRssIds.length === 0) {
    return [];
  }

  const result = await pool.query(
    `
    with candidates as (
      select video_id, 0 as priority, published_at
      from videos_cache
      where channel_id = any($1::text[])
        and live_broadcast_content in ('live', 'upcoming')
      union all
      select video_id, 1, published_at
      from videos_cache
      where channel_id = any($1::text[])
        and live_broadcast_content is null
        and published_at >= now() - make_interval(days => $4::int)
      union all
      select r.video_id, 1, v.published_at
      from unnest($2::text[]) as r(video_id)
      left join videos_cache v on v.video_id = r.video_id
      where v.video_id is null or v.live_broadcast_content is null
    )
    select video_id
    from candidates
    group by video_id
    order by min(priority), max(published_at) desc nulls first
    limit $3
    `,
    [channelIds, uniqueRssIds, limit, CLASSIFY_RECENT_DAYS],
  );

  return result.rows.map((row) => row.video_id);
}

// for channels with live off only upcoming rows matter
// a live row never changes what feeds show, an upcoming row stays hidden until reclassified
export async function findUpcomingVideoIds(channelIds: string[], limit: number): Promise<string[]> {
  if (channelIds.length === 0 || limit <= 0) {
    return [];
  }

  const result = await pool.query(
    `
    select video_id
    from videos_cache
    where channel_id = any($1::text[])
      and live_broadcast_content = 'upcoming'
    order by scheduled_start_time asc nulls first
    limit $2
    `,
    [channelIds, limit],
  );

  return result.rows.map((row) => row.video_id);
}

// channels with no state row are due, a missing row must not hide them
export async function getDueLiveChannels(
  channelIds: string[],
  ttlMinutes: number,
): Promise<string[]> {
  const uniqueIds = [...new Set(channelIds)];
  if (uniqueIds.length === 0) {
    return [];
  }

  const result = await pool.query(
    `
    select c.channel_id
    from unnest($1::text[]) as c(channel_id)
    left join channel_live_check_state s on s.channel_id = c.channel_id
    where s.channel_id is null
       or s.last_checked_at <= now() - make_interval(mins => $2::int)
    -- never checked first, then least recently checked
    order by s.last_checked_at asc nulls first
    `,
    [uniqueIds, ttlMinutes],
  );

  return result.rows.map((row) => row.channel_id);
}

// duplicate ids in one upsert make postgres reject the statement
export async function markLiveChannelsChecked(channelIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(channelIds)];
  if (uniqueIds.length === 0) {
    return;
  }

  await pool.query(
    `
    insert into channel_live_check_state (channel_id, last_checked_at)
    select c.channel_id, now()
    from unnest($1::text[]) as c(channel_id)
    on conflict (channel_id) do update
      set last_checked_at = now()
    `,
    [uniqueIds],
  );
}
