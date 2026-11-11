import type { Channel, FeedItem } from "../api";
import { DEMO_CHANNELS, DEMO_VIDEOS, type DemoVideo } from "./fixtures";

const HOUR_MS = 60 * 60 * 1000;
const SHORTS_MAX_SECONDS = 60;

// title order like the server's order by channel_title, en-US collation
const titleCollator = new Intl.Collator("en-US");

export type DemoStoreOverrides = {
  channels?: Channel[];
  videos?: DemoVideo[];
};

export type DemoStore = {
  getAllFeed(params: { offset: number; limit: number }): { items: FeedItem[]; hasMore: boolean };
  setWatched(videoId: string): void;
  setUnwatched(videoId: string): void;
  getChannels(): Channel[];
};

// input sorted published_at desc, the channel with the newest video comes out first
export function applyRoundRobin<T extends { channel_id: string }>(rows: T[]): T[] {
  const channelQueues = new Map<string, T[]>();

  for (const row of rows) {
    if (!channelQueues.has(row.channel_id)) {
      channelQueues.set(row.channel_id, []);
    }
    channelQueues.get(row.channel_id)!.push(row);
  }

  const result: T[] = [];
  for (let i = 0; result.length < rows.length; i++) {
    for (const queue of channelQueues.values()) {
      if (i < queue.length) result.push(queue[i]);
    }
  }
  return result;
}

// now is a Date or epoch ms
// overrides replace the fixtures
// channels are copied, the store never aliases the input
export function createDemoStore(now: Date | number, overrides: DemoStoreOverrides = {}): DemoStore {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const nowIso = new Date(nowMs).toISOString();
  const videos = overrides.videos ?? DEMO_VIDEOS;
  // flat fields, a shallow copy is a full copy
  const channels = new Map<string, Channel>(
    (overrides.channels ?? DEMO_CHANNELS).map((c) => [c.channelId, { ...c }]),
  );
  // value is null after unwatch, the entry is kept like the server row
  const watchedAt = new Map<string, string | null>();

  function getAllFeed({ offset, limit }: { offset: number; limit: number }) {
    const entries = videos.flatMap((video) => {
      const channel = channels.get(video.channelId);
      // unknown channel hidden, matching the server's join on subscriptions
      if (!channel || !channel.enabledAll) return [];
      // unknown duration kept
      const isShort =
        video.durationSeconds !== null && video.durationSeconds <= SHORTS_MAX_SECONDS;
      if (channel.excludedShorts && isShort) return [];
      return [{ video, channel }];
    });

    entries.sort((a, b) => a.video.hoursAgo - b.video.hoursAgo);

    const ordered = applyRoundRobin(
      entries.map(({ video, channel }) => {
        const watched = watchedAt.get(video.videoId) ?? null;
        return {
          video_id: video.videoId,
          channel_id: video.channelId,
          channel_title: channel.title,
          title: video.title,
          published_at: new Date(nowMs - video.hoursAgo * HOUR_MS).toISOString(),
          thumb_url: video.thumbUrl,
          watched_at: watched,
          is_watched: watched !== null,
        };
      }),
    );

    return {
      items: ordered.slice(offset, offset + limit),
      hasMore: offset + limit < ordered.length,
    };
  }

  function setWatched(videoId: string) {
    watchedAt.set(videoId, nowIso);
  }

  function setUnwatched(videoId: string) {
    watchedAt.set(videoId, null);
  }

  // copies so callers cannot change store state
  // sorted by title to match GET /api/channels
  function getChannels(): Channel[] {
    return [...channels.values()]
      .map((channel) => ({ ...channel }))
      .sort((a, b) => titleCollator.compare(a.title, b.title));
  }

  return { getAllFeed, setWatched, setUnwatched, getChannels };
}

let singleton: DemoStore | null = null;

// built on first use, importing this module does not read the clock
export function getDemoStore(): DemoStore {
  if (singleton === null) singleton = createDemoStore(Date.now());
  return singleton;
}

// next getDemoStore() builds fresh state
export function resetDemoStore(): void {
  singleton = null;
}
