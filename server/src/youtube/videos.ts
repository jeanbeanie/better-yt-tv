import { pool } from "../db/pool.js";
import { env } from "../config/env.js";

// shape we want to send into database
export type CachedVideo = {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string;
  thumbUrl: string | null;
};

// Resolve a channel's "uploads" playlist ID using YT API: channels.list
// Every YouTube channel has a related uploads playlist
async function fetchUploadsPlaylistId(args: {
  accessToken: string;
  channelId: string;
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

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `YouTube uploads playlist lookup failed: ${resp.status} ${text}`,
    );
  }

  const data: any = await resp.json();

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

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `YouTube uploads playlist videos fetch failed: ${resp.status} ${text}`,
    );
  }

  const data: any = await resp.json();

  return (data.items ?? [])
    .map((item: any) => ({
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
      (item: CachedVideo) =>
        Boolean(item.videoId && item.channelId && item.title && item.publishedAt),
    );
}

// Fetch recent public videos for one channel from YouTube
// Currently using search.list for the MVP 
// might switch to uploads-playlist flow later
export async function fetchRecentVideosForChannel(args: {
  accessToken: string;
  channelId: string;
  maxResults?: number;
}): Promise<CachedVideo[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");

  // snippet gives us title / thumbnails / publishedAt
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", args.channelId);
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", String(args.maxResults ?? 10));

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`YouTube recent videos fetch failed: ${resp.status} ${text}`);
  }

  const data: any = await resp.json();

  return (data.items ?? [])
    .map((item: any) => ({
      videoId: item.id?.videoId,
      channelId: item.snippet?.channelId,
      title: item.snippet?.title,
      publishedAt: item.snippet?.publishedAt,
      thumbUrl:
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        null,
    }))
    .filter(
      (item: CachedVideo) =>
        Boolean(item.videoId && item.channelId && item.title && item.publishedAt),
    );
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

// check if a channel's cached video data is still fresh
// if channel has no row yet, treat as stale so it gets fetched
export async function isChannelCacheStale(channelId: string) {
  const result = await pool.query(
    `
    select cache_expires_at
    from channel_recent_cache_state
    where channel_id = $1
    `,
    [channelId],
  );

  // No cache state row = channel has never been refreshed
  if (result.rowCount === 0) {
    return true;
  }

  const cacheExpiresAt = new Date(result.rows[0].cache_expires_at);
  return cacheExpiresAt.getTime() <= Date.now();
}

// After refreshing a channel, update its cache freshness window
// Future refreshes will skip channels that are still fresh
export async function markChannelCacheRefreshed(channelId: string) {
  const ttlMinutes = env.YOUTUBE_CACHE_TTL_MINUTES;
  const cacheExpiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await pool.query(
    `
    insert into channel_recent_cache_state (
      channel_id,
      cache_expires_at,
      last_checked_at
    )
    values ($1, $2, now())
    on conflict (channel_id) do update
      set cache_expires_at = excluded.cache_expires_at,
          last_checked_at = now()
    `,
    [channelId, cacheExpiresAt],
  );
}
