import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { recordQuotaUsage, type QuotaCallContext } from "./quota.js";
import type {
  YoutubeChannelsListResponse,
  YoutubePlaylistItem,
  YoutubePlaylistItemsListResponse,
  YoutubeVideo,
  YoutubeVideosListResponse,
} from "./apiTypes.js";

// shape we want to send into database
export type CachedVideo = {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string;
  thumbUrl: string | null;
};

// ISO 8601 duration from contentDetails, e.g. PT1H2M3S or P1DT2H
// null for anything unparseable
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;

  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match || match.slice(1).every((part) => part === undefined)) return null;

  const [days, hours, minutes, seconds] = match
    .slice(1)
    .map((part) => Number(part ?? 0));
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

// Resolve a channel's "uploads" playlist ID using YT API: channels.list
// Every YouTube channel has a related uploads playlist
async function fetchUploadsPlaylistId(args: {
  accessToken: string;
  channelId: string;
  quotaContext?: QuotaCallContext;
}): Promise<string> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");

  // We only need contentDetails since that contains relatedPlaylists.uploads
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", args.channelId);

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
    },
  });

  // log quota usage for this call
  await recordQuotaUsage("channels.list", 1, args.quotaContext ?? {});

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `YouTube uploads playlist lookup failed: ${resp.status} ${text}`,
    );
  }

  const data = (await resp.json()) as YoutubeChannelsListResponse;

  const uploadsPlaylistId =
    data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error(
      `No uploads playlist found for channel ${args.channelId}`,
    );
  }

  return uploadsPlaylistId;
}


// Fetch recent uploaded videos from a channel's uploads playlist
async function fetchRecentVideosFromUploadsPlaylist(args: {
  accessToken: string;
  uploadsPlaylistId: string;
  maxResults?: number;
  quotaContext?: QuotaCallContext;
}): Promise<CachedVideo[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");

  // snippet contains the video title, publication date, thumbnails,
  // channel metadata, and resourceId.videoId.
  url.searchParams.set("part", "snippet");
  url.searchParams.set("playlistId", args.uploadsPlaylistId);
  url.searchParams.set("maxResults", String(args.maxResults ?? 10));

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
    },
  });

  // log quota usage for this call
  await recordQuotaUsage("playlistItems.list", 1, args.quotaContext ?? {});

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `YouTube uploads playlist videos fetch failed: ${resp.status} ${text}`,
    );
  }

  const data = (await resp.json()) as YoutubePlaylistItemsListResponse;

  return (data.items ?? [])
    .map((item: YoutubePlaylistItem) => ({
      // In playlistItems.list are an [] of items => item.snippet.resourceId.videoId
      videoId: item.snippet?.resourceId?.videoId,

      // snippet.channelId should match the channel that owns the upload
      channelId: item.snippet?.channelId,

      title: item.snippet?.title,
      publishedAt: item.snippet?.publishedAt,

      // Prefer higher quality thumbnails if available, and then fall back safely
      thumbUrl:
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        null,
    }))
    .filter(
      // drop any items missing required fields to avoid storing broken records
      // incomplete items can come from deleted/privated uploads, etc
      (item): item is CachedVideo =>
        Boolean(item.videoId && item.channelId && item.title && item.publishedAt),
    );
}

// Fetch recent public videos for one channel from YouTube
export async function fetchRecentVideosForChannel(args: {
  accessToken: string;
  channelId: string;
  cachedUploadsPlaylistId?: string | null;
  maxResults?: number;
  quotaContext?: QuotaCallContext;
}): Promise<{ videos: CachedVideo[]; uploadsPlaylistId: string }> {
  // uploads playlist id never changes, reuse a cached one if we have it
  const uploadsPlaylistId =
    args.cachedUploadsPlaylistId ??
    (await fetchUploadsPlaylistId({
      accessToken: args.accessToken,
      channelId: args.channelId,
      quotaContext: args.quotaContext,
    }));

  const videos = await fetchRecentVideosFromUploadsPlaylist({
    accessToken: args.accessToken,
    uploadsPlaylistId,
    maxResults: args.maxResults ?? 10,
    quotaContext: args.quotaContext,
  });

  return { videos, uploadsPlaylistId };
}

// Save a batch of videos into videos_cache, upserting to avoid duplicates
export async function upsertVideosCache(videos: CachedVideo[]) {
  for (const video of videos) {
    await pool.query(
      `
      insert into videos_cache (
        video_id,
        channel_id,
        title,
        published_at,
        thumb_url,
        fetched_at
      )
      values ($1, $2, $3, $4, $5, now())
      on conflict (video_id) do update
        set title = excluded.title,
            published_at = excluded.published_at,
            thumb_url = excluded.thumb_url,
            fetched_at = now()
      `,
      [
        video.videoId,
        video.channelId,
        video.title,
        new Date(video.publishedAt),
        video.thumbUrl,
      ],
    );
  }
}

// VIDEO DETAILS
// hydrating a cached video fills in what the uploads playlist lacks, duration and live status
// findVideoIdsToHydrate picks ids, hydrateVideoDetails fetches them (50 per call) and upserts
// ids videos.list leaves out (deleted or private) get live_broadcast_content = 'none', not rechecked

// full details for one video from videos.list, ready for videos_cache
export type VideoDetails = CachedVideo & {
  durationSeconds: number | null;
  liveBroadcastContent: string;
  scheduledStartTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
};

// videos.list takes at most 50 ids per call, 1 unit regardless of parts
const VIDEOS_LIST_MAX_IDS = 50;

// null when a field we can't store without is missing
function toVideoDetails(item: YoutubeVideo): VideoDetails | null {
  const snippet = item.snippet;
  if (!item.id || !snippet?.channelId || !snippet.title || !snippet.publishedAt) {
    return null;
  }

  const liveBroadcastContent = snippet.liveBroadcastContent ?? "none";

  return {
    videoId: item.id,
    channelId: snippet.channelId,
    title: snippet.title,
    publishedAt: snippet.publishedAt,
    thumbUrl: snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url ?? null,
    // live and upcoming report P0D, which would read as a 0s short
    durationSeconds:
      liveBroadcastContent === "none"
        ? parseIsoDuration(item.contentDetails?.duration)
        : null,
    liveBroadcastContent,
    scheduledStartTime: item.liveStreamingDetails?.scheduledStartTime ?? null,
    actualStartTime: item.liveStreamingDetails?.actualStartTime ?? null,
    actualEndTime: item.liveStreamingDetails?.actualEndTime ?? null,
  };
}

// one videos.list call, at most VIDEOS_LIST_MAX_IDS ids
async function fetchVideoDetailsBatch(args: {
  accessToken: string;
  videoIds: string[];
  quotaContext?: QuotaCallContext;
}): Promise<VideoDetails[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,contentDetails,liveStreamingDetails");
  url.searchParams.set("id", args.videoIds.join(","));

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
    },
  });

  // log quota usage for this call
  await recordQuotaUsage("videos.list", 1, args.quotaContext ?? {});

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`YouTube video details fetch failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as YoutubeVideosListResponse;

  return (data.items ?? [])
    .map(toVideoDetails)
    .filter((item): item is VideoDetails => item !== null);
}

// one multi row upsert per batch
// published_at only set on insert, existing /all ordering stays put
async function upsertVideoDetails(videos: VideoDetails[]) {
  if (videos.length === 0) return;

  await pool.query(
    `
    insert into videos_cache (
      video_id,
      channel_id,
      title,
      published_at,
      thumb_url,
      duration_seconds,
      live_broadcast_content,
      scheduled_start_time,
      actual_start_time,
      actual_end_time,
      details_fetched_at,
      fetched_at
    )
    select t.*, now(), now()
    from unnest(
      $1::text[],
      $2::text[],
      $3::text[],
      $4::timestamptz[],
      $5::text[],
      $6::int[],
      $7::text[],
      $8::timestamptz[],
      $9::timestamptz[],
      $10::timestamptz[]
    ) as t(
      video_id,
      channel_id,
      title,
      published_at,
      thumb_url,
      duration_seconds,
      live_broadcast_content,
      scheduled_start_time,
      actual_start_time,
      actual_end_time
    )
    on conflict (video_id) do update
      set title = excluded.title,
          thumb_url = excluded.thumb_url,
          duration_seconds = excluded.duration_seconds,
          live_broadcast_content = excluded.live_broadcast_content,
          scheduled_start_time = excluded.scheduled_start_time,
          actual_start_time = excluded.actual_start_time,
          actual_end_time = excluded.actual_end_time,
          details_fetched_at = now()
    `,
    [
      videos.map((video) => video.videoId),
      videos.map((video) => video.channelId),
      videos.map((video) => video.title),
      videos.map((video) => new Date(video.publishedAt)),
      videos.map((video) => video.thumbUrl),
      videos.map((video) => video.durationSeconds),
      videos.map((video) => video.liveBroadcastContent),
      videos.map((video) => video.scheduledStartTime),
      videos.map((video) => video.actualStartTime),
      videos.map((video) => video.actualEndTime),
    ],
  );
}

// ids videos.list left out (deleted, privated) stop being rechecked
async function markVideoDetailsMissing(videoIds: string[]) {
  if (videoIds.length === 0) return;

  await pool.query(
    `
    update videos_cache
    set live_broadcast_content = 'none',
        details_fetched_at = now()
    where video_id = any($1)
    `,
    [videoIds],
  );
}

// cached videos in these channels never hydrated, plus live/upcoming ones
// last checked over a ttl ago, newest first
export async function findVideoIdsToHydrate(
  channelIds: string[],
  limit: number,
): Promise<string[]> {
  if (channelIds.length === 0) return [];

  const result = await pool.query(
    `
    select video_id
    from videos_cache
    where channel_id = any($1)
      and (
        details_fetched_at is null
        or (
          live_broadcast_content in ('live', 'upcoming')
          and details_fetched_at <= now() - make_interval(mins => $2)
        )
      )
    order by published_at desc
    limit $3
    `,
    [channelIds, env.YOUTUBE_CACHE_TTL_MINUTES, limit],
  );

  return result.rows.map((row) => row.video_id);
}

// fetch and save details in batches of VIDEOS_LIST_MAX_IDS
// batches saved before a failure are kept, the error still throws
// returns how many videos were saved
export async function hydrateVideoDetails(args: {
  accessToken: string;
  videoIds: string[];
  quotaContext?: QuotaCallContext;
}): Promise<number> {
  // an id twice in one upsert would hit the same row twice
  const videoIds = [...new Set(args.videoIds)];
  let hydrated = 0;

  for (let i = 0; i < videoIds.length; i += VIDEOS_LIST_MAX_IDS) {
    const batchIds = videoIds.slice(i, i + VIDEOS_LIST_MAX_IDS);
    const details = await fetchVideoDetailsBatch({
      accessToken: args.accessToken,
      videoIds: batchIds,
      quotaContext: args.quotaContext,
    });

    await upsertVideoDetails(details);

    const returnedIds = new Set(details.map((video) => video.videoId));
    await markVideoDetailsMissing(batchIds.filter((id) => !returnedIds.has(id)));

    hydrated += details.length;
  }

  return hydrated;
}

// check staleness and any cached uploads playlist id for a channel
// no row yet means stale, with no cached id
export async function getChannelCacheState(channelId: string): Promise<{
  stale: boolean;
  uploadsPlaylistId: string | null;
}> {
  const result = await pool.query(
    `
    select cache_expires_at, uploads_playlist_id
    from channel_recent_cache_state
    where channel_id = $1
    `,
    [channelId],
  );

  if (result.rowCount === 0) {
    return { stale: true, uploadsPlaylistId: null };
  }

  const cacheExpiresAt = new Date(result.rows[0].cache_expires_at);
  return {
    stale: cacheExpiresAt.getTime() <= Date.now(),
    uploadsPlaylistId: result.rows[0].uploads_playlist_id,
  };
}

// after refreshing a channel, update its freshness window and
// persist its uploads playlist id so future refreshes can reuse it
export async function markChannelCacheRefreshed(
  channelId: string,
  uploadsPlaylistId: string | null,
) {
  const ttlMinutes = env.YOUTUBE_CACHE_TTL_MINUTES;
  const cacheExpiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await pool.query(
    `
    insert into channel_recent_cache_state (
      channel_id,
      cache_expires_at,
      last_checked_at,
      uploads_playlist_id
    )
    values ($1, $2, now(), $3)
    on conflict (channel_id) do update
      set cache_expires_at = excluded.cache_expires_at,
          last_checked_at = now(),
          uploads_playlist_id = excluded.uploads_playlist_id
    `,
    [channelId, cacheExpiresAt, uploadsPlaylistId],
  );
}
