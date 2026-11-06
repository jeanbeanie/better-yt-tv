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
