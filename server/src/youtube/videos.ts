import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { recordQuotaUsage } from "./quota.js";

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

  // log quota usage for this call
  await recordQuotaUsage("channels.list", 1);

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

  // log quota usage for this call
  await recordQuotaUsage("playlistItems.list", 1);

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
export async function fetchRecentVideosForChannel(args: {
  accessToken: string;
  channelId: string;
  cachedUploadsPlaylistId?: string | null;
  maxResults?: number;
}): Promise<{ videos: CachedVideo[]; uploadsPlaylistId: string }> {
  // uploads playlist id never changes, reuse a cached one if we have it
  const uploadsPlaylistId =
    args.cachedUploadsPlaylistId ??
    (await fetchUploadsPlaylistId({
      accessToken: args.accessToken,
      channelId: args.channelId,
    }));

  const videos = await fetchRecentVideosFromUploadsPlaylist({
    accessToken: args.accessToken,
    uploadsPlaylistId,
    maxResults: args.maxResults ?? 10,
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
  uploadsPlaylistId: string,
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
