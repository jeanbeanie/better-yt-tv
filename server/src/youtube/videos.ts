import { pool } from "../db/pool.js";

// shape we want to send into database
export type CachedVideo = {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string;
  thumbUrl: string | null;
};

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
