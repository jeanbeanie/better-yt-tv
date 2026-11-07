import { pool } from "../db/pool.js";
import { recordQuotaUsage, type QuotaCallContext } from "./quota.js";
import type {
  YoutubeVideo,
  YoutubeVideosListResponse,
} from "./apiTypes.js";

const RSS_FETCH_TIMEOUT_MS = 5000;

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

// drops items missing the fields the upsert needs
function toVideoRow(item: YoutubeVideo): VideoRow | null {
  const videoId = item.id;
  const channelId = item.snippet?.channelId;
  const title = item.snippet?.title;
  const publishedAt = item.snippet?.publishedAt;
  if (!videoId || !channelId || !title || !publishedAt) {
    return null;
  }

  return {
    videoId,
    channelId,
    title,
    publishedAt: new Date(publishedAt),
    thumbUrl:
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      null,
    liveBroadcastContent:
      item.snippet?.liveBroadcastContent === "live" ||
      item.snippet?.liveBroadcastContent === "upcoming"
        ? item.snippet.liveBroadcastContent
        : "none",
    scheduledStartTime: item.liveStreamingDetails?.scheduledStartTime
      ? new Date(item.liveStreamingDetails.scheduledStartTime)
      : null,
    actualStartTime: item.liveStreamingDetails?.actualStartTime
      ? new Date(item.liveStreamingDetails.actualStartTime)
      : null,
  };
}

async function fetchVideoDetails(args: {
  accessToken: string;
  videoIds: string[];
  quotaContext?: QuotaCallContext;
}): Promise<YoutubeVideo[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,liveStreamingDetails");
  url.searchParams.set("id", args.videoIds.join(","));

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
    },
  });

  // quota is billed on receipt, so log before the ok check
  await recordQuotaUsage("videos.list", 1, args.quotaContext ?? {});

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`YouTube video details fetch failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as YoutubeVideosListResponse;
  return data.items ?? [];
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
    const items = await fetchVideoDetails({
      accessToken: args.accessToken,
      videoIds: uniqueIds.slice(i, i + VIDEOS_LIST_MAX_IDS),
      quotaContext: args.quotaContext,
    });

    const rows = items
      .map(toVideoRow)
      .filter((row): row is VideoRow => row !== null);
    if (rows.length === 0) {
      continue;
    }

    await upsertVideoRows(rows);
    saved += rows.length;
  }

  return saved;
}
