import type { Channel, FeedItem, ListChannel, ListDetail, ListSummary } from "../api";
import { DEMO_CHANNELS, DEMO_LISTS, DEMO_VIDEOS, type DemoList, type DemoVideo } from "./fixtures";

const HOUR_MS = 60 * 60 * 1000;
const SHORTS_MAX_SECONDS = 60;

// title order like the server's order by channel_title, en-US collation
const titleCollator = new Intl.Collator("en-US");

export type DemoStoreOverrides = {
  channels?: Channel[];
  videos?: DemoVideo[];
  lists?: DemoList[];
};

export type ChannelPatch = {
  enabledAll?: boolean;
  enabledLive?: boolean;
  excludedShorts?: boolean;
};

// updatedAt is the store clock, same stamp as watched_at
export type ChannelUpdate = Pick<Channel, "channelId" | "enabledAll" | "enabledLive" | "excludedShorts"> & {
  updatedAt: string;
};

// not_found for an unknown id, duplicate for another list's exact name
export type SaveListResult = { list: ListDetail } | { error: "not_found" | "duplicate" };

export type DemoStore = {
  getAllFeed(params: { offset: number; limit: number }): { items: FeedItem[]; hasMore: boolean };
  setWatched(videoId: string): void;
  setUnwatched(videoId: string): void;
  getChannels(): Channel[];
  updateChannel(channelId: string, patch: ChannelPatch): ChannelUpdate | null;
  updateChannels(channelIds: string[], patch: ChannelPatch): number;
  getLists(): ListSummary[];
  getList(listId: string): ListDetail | null;
  getListFeed(
    listId: string,
    params: { offset: number; limit: number },
  ): { list: { id: string; name: string }; items: FeedItem[]; hasMore: boolean } | null;
  createList(name: string): Omit<ListDetail, "channels"> | null;
  deleteList(listId: string): boolean;
  saveList(listId: string, name: string, channelIds: string[]): SaveListResult;
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

// non-boolean values ignored, like the server's typeof checks
function applyBooleanFields(channel: Channel, patch: ChannelPatch): void {
  if (typeof patch.enabledAll === "boolean") channel.enabledAll = patch.enabledAll;
  if (typeof patch.enabledLive === "boolean") channel.enabledLive = patch.enabledLive;
  if (typeof patch.excludedShorts === "boolean") channel.excludedShorts = patch.excludedShorts;
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
  // copies each list and its membership, the store never aliases the input
  // duplicate channel ids collapse like the server's list_channels key
  const lists = new Map<string, DemoList>(
    (overrides.lists ?? DEMO_LISTS).map((l): [string, DemoList] => [
      l.listId,
      { listId: l.listId, name: l.name, channelIds: [...new Set(l.channelIds)] },
    ]),
  );
  // value is null after unwatch, the entry is kept like the server row
  const watchedAt = new Map<string, string | null>();
  // per store, so each reset starts the counter at 1
  let nextListNumber = 1;

  // one builder for the All and list feeds, so their filters cannot drift
  // includeChannel decides membership, shorts and watched state are shared
  function buildFeed(
    includeChannel: (channel: Channel) => boolean,
    { offset, limit }: { offset: number; limit: number },
  ): { items: FeedItem[]; hasMore: boolean } {
    const entries = videos.flatMap((video) => {
      const channel = channels.get(video.channelId);
      // unknown channel hidden, matching the server's join on subscriptions
      if (!channel || !includeChannel(channel)) return [];
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

  function getAllFeed({ offset, limit }: { offset: number; limit: number }) {
    return buildFeed((channel) => channel.enabledAll, { offset, limit });
  }

  function setWatched(videoId: string) {
    watchedAt.set(videoId, nowIso);
  }

  function setUnwatched(videoId: string) {
    watchedAt.set(videoId, null);
  }

  // copies, callers cannot change store state
  // sorted by title to match GET /api/channels
  function getChannels(): Channel[] {
    return [...channels.values()]
      .map((channel) => ({ ...channel }))
      .sort((a, b) => titleCollator.compare(a.title, b.title));
  }

  // non-boolean values ignored, see applyBooleanFields
  function updateChannel(channelId: string, patch: ChannelPatch): ChannelUpdate | null {
    const channel = channels.get(channelId);
    if (!channel) return null;
    applyBooleanFields(channel, patch);
    // same fields as the server's PATCH response
    return {
      channelId: channel.channelId,
      enabledAll: channel.enabledAll,
      enabledLive: channel.enabledLive,
      excludedShorts: channel.excludedShorts,
      updatedAt: nowIso,
    };
  }

  // counts distinct known channels, unknown ids are skipped
  function updateChannels(channelIds: string[], patch: ChannelPatch): number {
    const matched = new Set<Channel>();
    for (const channelId of channelIds) {
      const channel = channels.get(channelId);
      if (channel) matched.add(channel);
    }
    for (const channel of matched) applyBooleanFields(channel, patch);
    return matched.size;
  }

  // fresh objects, callers cannot change store state
  // unknown channel ids are skipped in counts and detail
  function getLists(): ListSummary[] {
    return [...lists.values()].map((list) => ({
      id: list.listId,
      name: list.name,
      channelCount: list.channelIds.filter((id) => channels.has(id)).length,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));
  }

  // channels sorted by title, channelIds in that same order
  function getList(listId: string): ListDetail | null {
    const list = lists.get(listId);
    if (!list) return null;
    const members = list.channelIds
      .flatMap((channelId) => {
        const channel = channels.get(channelId);
        return channel ? [channel] : [];
      })
      .sort((a, b) => titleCollator.compare(a.title, b.title));
    return {
      id: list.listId,
      name: list.name,
      createdAt: nowIso,
      updatedAt: nowIso,
      channelIds: members.map((c) => c.channelId),
      channels: members.map(
        (c): ListChannel => ({ channelId: c.channelId, title: c.title, thumbUrl: c.thumbUrl }),
      ),
    };
  }

  // ignores enabledAll, a channel can be off in the All feed but still in a list
  function getListFeed(listId: string, { offset, limit }: { offset: number; limit: number }) {
    const list = lists.get(listId);
    if (!list) return null;
    const memberIds = new Set(list.channelIds);
    return {
      list: { id: list.listId, name: list.name },
      ...buildFeed((channel) => memberIds.has(channel.channelId), { offset, limit }),
    };
  }

  // null when the exact name is taken, the caller trims and validates
  function createList(name: string): Omit<ListDetail, "channels"> | null {
    for (const list of lists.values()) {
      if (list.name === name) return null;
    }
    // skips ids a fixture or earlier create already took
    let listId: string;
    do {
      listId = `demo-list-${nextListNumber++}`;
    } while (lists.has(listId));
    lists.set(listId, { listId, name, channelIds: [] });
    return { id: listId, name, createdAt: nowIso, updatedAt: nowIso, channelIds: [] };
  }

  // false for an unknown id, membership goes with the list
  function deleteList(listId: string): boolean {
    return lists.delete(listId);
  }

  // checks run before any write, a refused save changes nothing
  // channels.has also drops non string ids
  function saveList(listId: string, name: string, channelIds: string[]): SaveListResult {
    const list = lists.get(listId);
    if (!list) return { error: "not_found" };
    for (const other of lists.values()) {
      if (other !== list && other.name === name) return { error: "duplicate" };
    }
    list.name = name;
    // Set keeps first appearance order, detail sorts by title anyway
    list.channelIds = [...new Set(channelIds)].filter((id) => channels.has(id));
    return { list: getList(listId)! };
  }

  return {
    getAllFeed,
    getLists,
    getList,
    getListFeed,
    createList,
    deleteList,
    saveList,
    setWatched,
    setUnwatched,
    getChannels,
    updateChannel,
    updateChannels,
  };
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
