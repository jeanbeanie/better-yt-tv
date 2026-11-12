import { describe, it, expect, beforeEach } from "vitest";
import {
  applyRoundRobin,
  createDemoStore,
  getDemoStore,
  resetDemoStore,
  type ChannelPatch,
  type DemoStore,
} from "./store";
import { DEMO_CHANNELS, DEMO_VIDEOS, type DemoList, type DemoVideo } from "./fixtures";
import type { Channel, FeedItem, ListDetail } from "../api";

const NOW = new Date("2026-11-11T12:00:00Z");
const ALL = { offset: 0, limit: 200 };

// one-video fixture helper, hoursAgo 1 keeps published_at easy to reason about
function video(overrides: Partial<DemoVideo> = {}): DemoVideo {
  return {
    videoId: "v1",
    channelId: "demo-blender",
    title: "Video",
    hoursAgo: 1,
    thumbUrl: "https://example.test/v1.jpg",
    durationSeconds: null,
    ...overrides,
  };
}

function feedIds(store: DemoStore): string[] {
  return store.getAllFeed(ALL).items.map((i) => i.video_id);
}

beforeEach(() => {
  resetDemoStore();
});

describe("applyRoundRobin", () => {
  type Row = { channel_id: string; video_id: string };

  it("spreads out a busy channel's videos instead of leaving them consecutive", () => {
    // already sorted published_at desc, same order the real query returns
    const rows: Row[] = [
      { channel_id: "A", video_id: "a3" },
      { channel_id: "A", video_id: "a2" },
      { channel_id: "B", video_id: "b1" },
      { channel_id: "A", video_id: "a1" },
      { channel_id: "C", video_id: "c1" },
    ];

    const result = applyRoundRobin(rows);

    expect(result.map((r) => r.video_id)).toEqual(["a3", "b1", "c1", "a2", "a1"]);
  });

  it("keeps every row, only reorders", () => {
    const rows: Row[] = [
      { channel_id: "A", video_id: "a1" },
      { channel_id: "B", video_id: "b1" },
      { channel_id: "A", video_id: "a2" },
    ];

    const result = applyRoundRobin(rows);

    expect(result).toHaveLength(rows.length);
    expect(result.map((r) => r.video_id).sort()).toEqual(["a1", "a2", "b1"]);
  });

  it("handles a single channel by leaving its order unchanged", () => {
    const rows: Row[] = [
      { channel_id: "A", video_id: "a3" },
      { channel_id: "A", video_id: "a2" },
      { channel_id: "A", video_id: "a1" },
    ];

    const result = applyRoundRobin(rows);

    expect(result.map((r) => r.video_id)).toEqual(["a3", "a2", "a1"]);
  });

  it("handles an empty array", () => {
    expect(applyRoundRobin([])).toEqual([]);
  });

  it("preserves extra fields on each row untouched", () => {
    const rows = [
      { channel_id: "A", video_id: "a1", title: "First" },
      { channel_id: "B", video_id: "b1", title: "Second" },
    ];

    const result = applyRoundRobin(rows);

    expect(result).toEqual(rows);
  });
});

describe("demo store feed filter", () => {
  it("keeps a video with unknown duration", () => {
    const store = createDemoStore(NOW, { videos: [video({ durationSeconds: null })] });

    expect(feedIds(store)).toEqual(["v1"]);
  });

  it("hides exactly 60 seconds when excludedShorts is on", () => {
    const store = createDemoStore(NOW, { videos: [video({ durationSeconds: 60 })] });

    expect(feedIds(store)).toEqual([]);
  });

  it("keeps 61 seconds when excludedShorts is on", () => {
    const store = createDemoStore(NOW, { videos: [video({ durationSeconds: 61 })] });

    expect(feedIds(store)).toEqual(["v1"]);
  });

  it("keeps a 60 second video when the channel's excludedShorts is off", () => {
    const channels = DEMO_CHANNELS.map((c) =>
      c.channelId === "demo-blender" ? { ...c, excludedShorts: false } : c,
    );
    const store = createDemoStore(NOW, {
      channels,
      videos: [video({ durationSeconds: 60 })],
    });

    expect(feedIds(store)).toEqual(["v1"]);
  });

  it("hides every video of a channel with enabledAll off", () => {
    const channels = DEMO_CHANNELS.map((c) =>
      c.channelId === "demo-blender" ? { ...c, enabledAll: false } : c,
    );
    const store = createDemoStore(NOW, {
      channels,
      videos: [video({ videoId: "v1" }), video({ videoId: "v2", channelId: "demo-nasa" })],
    });

    expect(feedIds(store)).toEqual(["v2"]);
  });

  it("hides a video whose channel is not in the store", () => {
    const store = createDemoStore(NOW, {
      videos: [video({ channelId: "demo-missing" })],
    });

    expect(feedIds(store)).toEqual([]);
  });
});

describe("demo store feed shape", () => {
  it("resolves published_at against the injected now", () => {
    const store = createDemoStore(NOW);
    const item = store.getAllFeed(ALL).items.find((i) => i.video_id === "pvUy69I_Xuk");

    // hoursAgo 2 on the fixture
    expect(item).toEqual<FeedItem>({
      video_id: "pvUy69I_Xuk",
      channel_id: "demo-blender",
      channel_title: "Blender",
      title: "What's New in Blender 5.3! Official Overview",
      published_at: "2026-11-11T10:00:00.000Z",
      thumb_url: "https://i.ytimg.com/vi/pvUy69I_Xuk/mqdefault.jpg",
      watched_at: null,
      is_watched: false,
    });
  });

  it("orders the first page round robin with the most recent channel first", () => {
    const { items } = createDemoStore(NOW).getAllFeed({ offset: 0, limit: 11 });

    expect(items).toHaveLength(11);
    expect(new Set(items.map((i) => i.channel_id)).size).toBe(11);
    expect(items[0].channel_id).toBe("demo-blender");
  });
});

describe("demo store pagination", () => {
  it("pages the default fixtures at 50 with hasMore set", () => {
    const store = createDemoStore(NOW);

    const first = store.getAllFeed({ offset: 0, limit: 50 });
    const second = store.getAllFeed({ offset: 50, limit: 50 });

    expect(first.items).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    // 3 of the 60 fixture videos are 45 or 46 seconds and hidden by the Shorts setting
    expect(second.items).toHaveLength(7);
    expect(second.hasMore).toBe(false);
    const ids = [...first.items, ...second.items].map((i) => i.video_id);
    expect(new Set(ids).size).toBe(57);
  });

  it("returns an empty page with hasMore false past the end", () => {
    const store = createDemoStore(NOW);

    expect(store.getAllFeed({ offset: 500, limit: 50 })).toEqual({ items: [], hasMore: false });
  });
});

describe("demo store watched state", () => {
  it("setWatched sets is_watched and watched_at to the store's now", () => {
    const store = createDemoStore(NOW);

    store.setWatched("pvUy69I_Xuk");
    const item = store.getAllFeed(ALL).items.find((i) => i.video_id === "pvUy69I_Xuk");

    expect(item?.is_watched).toBe(true);
    expect(item?.watched_at).toBe(NOW.toISOString());
  });

  it("setUnwatched nulls watched_at and keeps the video in the feed", () => {
    const store = createDemoStore(NOW);
    const before = feedIds(store);

    store.setWatched("pvUy69I_Xuk");
    store.setUnwatched("pvUy69I_Xuk");
    const item = store.getAllFeed(ALL).items.find((i) => i.video_id === "pvUy69I_Xuk");

    expect(item?.is_watched).toBe(false);
    expect(item?.watched_at).toBeNull();
    expect(feedIds(store)).toEqual(before);
  });

  it("accepts an unknown video id without changing the feed", () => {
    const store = createDemoStore(NOW);
    const before = store.getAllFeed(ALL);

    expect(() => store.setWatched("not-a-fixture")).not.toThrow();
    expect(() => store.setUnwatched("never-watched")).not.toThrow();

    expect(store.getAllFeed(ALL)).toEqual(before);
  });
});

describe("demo store isolation", () => {
  it("does not share watched state between stores", () => {
    const a = createDemoStore(NOW);
    const b = createDemoStore(NOW);

    a.setWatched("pvUy69I_Xuk");
    const item = b.getAllFeed(ALL).items.find((i) => i.video_id === "pvUy69I_Xuk");

    expect(item?.is_watched).toBe(false);
  });

  it("copies channel overrides so later input mutation does not reach the store", () => {
    const channels = DEMO_CHANNELS.map((c) => ({ ...c }));
    const store = createDemoStore(NOW, { channels });
    const before = feedIds(store);

    channels.forEach((c) => {
      c.enabledAll = false;
    });

    expect(feedIds(store)).toEqual(before);
  });

  it("leaves DEMO_CHANNELS untouched by store use", () => {
    const snapshot = structuredClone(DEMO_CHANNELS);
    const store = createDemoStore(NOW);

    store.setWatched("pvUy69I_Xuk");
    store.setUnwatched("pvUy69I_Xuk");
    store.getAllFeed(ALL);

    expect(DEMO_CHANNELS).toEqual(snapshot);
  });

  it("resetDemoStore makes getDemoStore build fresh initial data", () => {
    const first = getDemoStore();
    first.setWatched("pvUy69I_Xuk");

    resetDemoStore();
    const second = getDemoStore();

    expect(second).not.toBe(first);
    const item = second.getAllFeed(ALL).items.find((i) => i.video_id === "pvUy69I_Xuk");
    expect(item?.is_watched).toBe(false);
  });
});

describe("demo store channels", () => {
  const SERVER_ORDER = [
    "3Blue1Brown",
    "Blender",
    "CGP Grey",
    "Computerphile",
    "exit node",
    "Fireship",
    "Kurzgesagt – In a Nutshell",
    "NASA",
    "SmarterEveryDay",
    "TED-Ed",
    "Veritasium",
  ];

  it("returns the 11 fixture channels in the server's title order", () => {
    const channels = createDemoStore(NOW).getChannels();

    expect(channels).toHaveLength(11);
    expect(channels.map((c) => c.title)).toEqual(SERVER_ORDER);
    expect(channels[0]).toEqual({
      channelId: "demo-3blue1brown",
      title: "3Blue1Brown",
      thumbUrl: null,
      enabledAll: true,
      enabledLive: true,
      excludedShorts: true,
    });
  });

  it("returns copies, so mutating returned rows leaves the store and feed unchanged", () => {
    const store = createDemoStore(NOW);
    const returned = store.getChannels();
    returned.pop();
    returned[0].title = "Changed";
    returned[0].enabledAll = false;

    const again = store.getChannels();
    expect(again).toHaveLength(11);
    expect(again[0].title).toBe("3Blue1Brown");
    expect(again[0].enabledAll).toBe(true);
    expect(feedIds(store)).toContain("pvUy69I_Xuk");
  });

  it("keeps two stores separate, including from the override input", () => {
    const input = DEMO_CHANNELS.map((c) => ({ ...c }));
    const first = createDemoStore(NOW, { channels: input });
    const second = createDemoStore(NOW);

    input[1].title = "Mutated input";
    first.getChannels()[0].enabledLive = false;

    expect(first.getChannels().map((c) => c.title)).toContain("Blender");
    expect(first.getChannels().map((c) => c.title)).not.toContain("Mutated input");
    expect(second.getChannels().every((c) => c.enabledLive)).toBe(true);
  });

  it("leaves DEMO_CHANNELS unchanged after reads and mutations", () => {
    const snapshot = structuredClone(DEMO_CHANNELS);
    const store = createDemoStore(NOW);
    store.getChannels().forEach((c) => {
      c.title = "Changed";
      c.excludedShorts = false;
    });

    expect(DEMO_CHANNELS).toEqual(snapshot);
  });
});

describe("demo store channel updates", () => {
  const NASA_SHORTS = ["29ixFQIGZaY", "3Yqi3D4b2RQ", "FkgVB19I6xw"];

  it.each([
    ["enabledAll", { enabledAll: false }],
    ["enabledLive", { enabledLive: false }],
    ["excludedShorts", { excludedShorts: false }],
  ] as const)("applies %s alone and leaves the other flags", (field, patch) => {
    const store = createDemoStore(NOW);

    const row = store.updateChannel("demo-blender", patch);

    expect(row).toMatchObject({ channelId: "demo-blender", [field]: false });
    const others = (["enabledAll", "enabledLive", "excludedShorts"] as const).filter(
      (key) => key !== field,
    );
    for (const key of others) expect(row?.[key]).toBe(true);
  });

  it("applies several boolean fields together", () => {
    const store = createDemoStore(NOW);

    const row = store.updateChannel("demo-blender", {
      enabledAll: false,
      enabledLive: false,
      excludedShorts: false,
    });

    expect(row).toMatchObject({
      enabledAll: false,
      enabledLive: false,
      excludedShorts: false,
    });
    expect(store.getChannels().find((c) => c.channelId === "demo-blender")).toMatchObject({
      enabledAll: false,
      enabledLive: false,
      excludedShorts: false,
    });
  });

  it("ignores non-boolean values and keeps the boolean ones", () => {
    const store = createDemoStore(NOW);
    const junk = { enabledAll: "no", enabledLive: 0, excludedShorts: null } as unknown as ChannelPatch;

    expect(store.updateChannel("demo-blender", junk)).toMatchObject({
      enabledAll: true,
      enabledLive: true,
      excludedShorts: true,
    });

    const mixed = { enabledLive: false, excludedShorts: "no" } as unknown as ChannelPatch;
    expect(store.updateChannel("demo-blender", mixed)).toMatchObject({
      enabledLive: false,
      excludedShorts: true,
    });
  });

  it("returns null for a channel that is not in the store", () => {
    const store = createDemoStore(NOW);

    expect(store.updateChannel("demo-missing", { enabledAll: false })).toBeNull();
  });

  it("stamps updatedAt from the store clock", () => {
    const store = createDemoStore(NOW);

    expect(store.updateChannel("demo-blender", { enabledAll: false })?.updatedAt).toBe(
      NOW.toISOString(),
    );
  });

  it("returns a copy, so mutating it leaves the store unchanged", () => {
    const store = createDemoStore(NOW);
    const row = store.updateChannel("demo-blender", { enabledAll: false });
    if (!row) throw new Error("expected a row");
    row.enabledAll = true;
    row.excludedShorts = false;

    const blender = store.getChannels().find((c) => c.channelId === "demo-blender");
    expect(blender).toMatchObject({ title: "Blender", enabledAll: false, excludedShorts: true });
  });

  it("keeps two stores separate", () => {
    const first = createDemoStore(NOW);
    const second = createDemoStore(NOW);

    first.updateChannel("demo-blender", { enabledAll: false });

    expect(second.getChannels().every((c) => c.enabledAll)).toBe(true);
    expect(feedIds(second)).toContain("pvUy69I_Xuk");
  });

  it("leaves DEMO_CHANNELS unchanged after updates", () => {
    const snapshot = structuredClone(DEMO_CHANNELS);
    const store = createDemoStore(NOW);
    store.updateChannel("demo-blender", { enabledAll: false, excludedShorts: false });
    store.updateChannel("demo-nasa", { enabledLive: false });

    expect(DEMO_CHANNELS).toEqual(snapshot);
  });

  it("hides a channel's videos with enabledAll off and restores them when it is flipped back", () => {
    const store = createDemoStore(NOW);
    const blenderIds = DEMO_VIDEOS.filter((v) => v.channelId === "demo-blender").map((v) => v.videoId);
    const before = feedIds(store);
    expect(blenderIds.every((id) => before.includes(id))).toBe(true);

    store.updateChannel("demo-blender", { enabledAll: false });
    const hidden = feedIds(store);
    expect(hidden).toHaveLength(before.length - blenderIds.length);
    expect(blenderIds.some((id) => hidden.includes(id))).toBe(false);

    store.updateChannel("demo-blender", { enabledAll: true });
    expect(feedIds(store)).toEqual(before);
  });

  it("shows NASA's short clips in the feed once excludedShorts is off", () => {
    const store = createDemoStore(NOW);
    expect(feedIds(store)).toHaveLength(57);
    expect(NASA_SHORTS.some((id) => feedIds(store).includes(id))).toBe(false);

    store.updateChannel("demo-nasa", { excludedShorts: false });

    const ids = feedIds(store);
    expect(ids).toHaveLength(60);
    for (const id of NASA_SHORTS) expect(ids).toContain(id);
  });

  it("reflects updates in getChannels", () => {
    const store = createDemoStore(NOW);

    store.updateChannel("demo-nasa", { enabledAll: false, excludedShorts: false });

    expect(store.getChannels().find((c) => c.channelId === "demo-nasa")).toMatchObject({
      enabledAll: false,
      enabledLive: true,
      excludedShorts: false,
    });
  });
});

describe("demo store bulk updates", () => {
  const ALL_IDS = DEMO_CHANNELS.map((c) => c.channelId);

  it("applies each flag to every listed channel and leaves the others alone", () => {
    const store = createDemoStore(NOW);
    const listed = ["demo-blender", "demo-nasa"];

    const count = store.updateChannels(listed, {
      enabledAll: false,
      enabledLive: false,
      excludedShorts: false,
    });

    expect(count).toBe(2);
    const channels = store.getChannels();
    for (const channel of channels.filter((c) => listed.includes(c.channelId))) {
      expect(channel).toMatchObject({ enabledAll: false, enabledLive: false, excludedShorts: false });
    }
    for (const channel of channels.filter((c) => !listed.includes(c.channelId))) {
      expect(channel).toMatchObject({ enabledAll: true, enabledLive: true, excludedShorts: true });
    }
  });

  it("returns the matched count and ignores unknown ids", () => {
    const store = createDemoStore(NOW);

    expect(store.updateChannels(["demo-blender", "demo-missing"], { enabledAll: false })).toBe(1);

    expect(store.getChannels()).toHaveLength(11);
    expect(store.getChannels().find((c) => c.channelId === "demo-blender")?.enabledAll).toBe(false);
  });

  it("returns 0 and changes nothing when every id is unknown", () => {
    const store = createDemoStore(NOW);
    const before = store.getChannels();

    expect(store.updateChannels(["demo-missing", "demo-also-missing"], { enabledAll: false })).toBe(0);

    expect(store.getChannels()).toEqual(before);
    expect(feedIds(store)).toHaveLength(57);
  });

  it("counts a duplicated id once", () => {
    const store = createDemoStore(NOW);

    expect(store.updateChannels(["demo-blender", "demo-blender"], { enabledAll: false })).toBe(1);
  });

  it("ignores non-string ids and non-boolean values", () => {
    const store = createDemoStore(NOW);
    const badIds = [5, null, { id: "demo-blender" }] as unknown as string[];

    expect(store.updateChannels(badIds, { enabledAll: false })).toBe(0);

    const junk = { enabledAll: "no", enabledLive: 0, excludedShorts: null } as unknown as ChannelPatch;
    expect(store.updateChannels(["demo-blender"], junk)).toBe(1);
    expect(store.getChannels().find((c) => c.channelId === "demo-blender")).toMatchObject({
      enabledAll: true,
      enabledLive: true,
      excludedShorts: true,
    });
  });

  it("keeps two stores separate and leaves DEMO_CHANNELS unchanged", () => {
    const snapshot = structuredClone(DEMO_CHANNELS);
    const first = createDemoStore(NOW);
    const second = createDemoStore(NOW);

    first.updateChannels(ALL_IDS, { enabledAll: false, excludedShorts: false });

    expect(second.getChannels().every((c) => c.enabledAll && c.excludedShorts)).toBe(true);
    expect(DEMO_CHANNELS).toEqual(snapshot);
  });

  it("removes the videos of every disabled channel from getAllFeed", () => {
    const store = createDemoStore(NOW);
    const targets = ["demo-blender", "demo-nasa"];
    const before = feedIds(store);
    const removed = DEMO_VIDEOS.filter((v) => targets.includes(v.channelId))
      .map((v) => v.videoId)
      .filter((id) => before.includes(id));
    expect(removed.length).toBeGreaterThan(0);

    store.updateChannels(targets, { enabledAll: false });

    const after = feedIds(store);
    expect(after).toHaveLength(before.length - removed.length);
    expect(removed.some((id) => after.includes(id))).toBe(false);
  });

  it("shows all 60 fixture videos once excludedShorts is off on every channel", () => {
    const store = createDemoStore(NOW);
    expect(feedIds(store)).toHaveLength(57);

    expect(store.updateChannels(ALL_IDS, { excludedShorts: false })).toBe(11);

    expect(feedIds(store)).toHaveLength(60);
  });
});

describe("demo store lists", () => {
  const SAVED_AT = "2026-11-11T12:00:00.000Z";

  // list-one names gamma before alpha, so title order has to come from the sort
  // demo-ghost is not in the store, so it must be dropped from counts and detail
  const SMALL_CHANNELS: Channel[] = [
    {
      channelId: "demo-alpha",
      title: "Alpha",
      thumbUrl: "https://example.test/alpha.jpg",
      enabledAll: true,
      enabledLive: true,
      excludedShorts: true,
    },
    { channelId: "demo-beta", title: "Beta", thumbUrl: null, enabledAll: true, enabledLive: true, excludedShorts: true },
    { channelId: "demo-gamma", title: "gamma", thumbUrl: null, enabledAll: true, enabledLive: true, excludedShorts: true },
    { channelId: "demo-delta", title: "Delta", thumbUrl: null, enabledAll: true, enabledLive: true, excludedShorts: true },
  ];

  const SMALL_LISTS: DemoList[] = [
    { listId: "list-one", name: "One", channelIds: ["demo-gamma", "demo-alpha", "demo-ghost"] },
    { listId: "list-two", name: "Two", channelIds: ["demo-beta"] },
    { listId: "list-empty", name: "Empty", channelIds: ["demo-ghost"] },
  ];

  // oracle written out by hand, not read from the store
  const LIST_ONE_DETAIL: ListDetail = {
    id: "list-one",
    name: "One",
    createdAt: SAVED_AT,
    updatedAt: SAVED_AT,
    channelIds: ["demo-alpha", "demo-gamma"],
    channels: [
      { channelId: "demo-alpha", title: "Alpha", thumbUrl: "https://example.test/alpha.jpg" },
      { channelId: "demo-gamma", title: "gamma", thumbUrl: null },
    ],
  };

  function listStore(videos: DemoVideo[] = []): DemoStore {
    return createDemoStore(NOW, { channels: SMALL_CHANNELS, videos, lists: SMALL_LISTS });
  }

  function listFeedIds(store: DemoStore, listId: string): string[] {
    return store.getListFeed(listId, ALL)!.items.map((i) => i.video_id);
  }

  function itemFor(items: FeedItem[], videoId: string): FeedItem | undefined {
    return items.find((i) => i.video_id === videoId);
  }

  // list-one holds gamma and alpha, delta is in no list
  function roundRobinVideos(): DemoVideo[] {
    return [
      video({ videoId: "d1", channelId: "demo-delta", hoursAgo: 0.5 }),
      video({ videoId: "g1", channelId: "demo-gamma", hoursAgo: 1 }),
      video({ videoId: "g2", channelId: "demo-gamma", hoursAgo: 2 }),
      video({ videoId: "a1", channelId: "demo-alpha", hoursAgo: 3 }),
      video({ videoId: "a2", channelId: "demo-alpha", hoursAgo: 4 }),
      video({ videoId: "b1", channelId: "demo-beta", hoursAgo: 5 }),
    ];
  }

  it("lists summaries in creation order with channel counts that skip unknown ids", () => {
    expect(listStore().getLists()).toEqual([
      { id: "list-one", name: "One", channelCount: 2, createdAt: SAVED_AT, updatedAt: SAVED_AT },
      { id: "list-two", name: "Two", channelCount: 1, createdAt: SAVED_AT, updatedAt: SAVED_AT },
      { id: "list-empty", name: "Empty", channelCount: 0, createdAt: SAVED_AT, updatedAt: SAVED_AT },
    ]);
  });

  it("returns list detail with channels in title order and unknown ids dropped", () => {
    expect(listStore().getList("list-one")).toEqual(LIST_ONE_DETAIL);
  });

  it("returns an empty detail when every channel id is unknown", () => {
    expect(listStore().getList("list-empty")).toEqual({
      id: "list-empty",
      name: "Empty",
      createdAt: SAVED_AT,
      updatedAt: SAVED_AT,
      channelIds: [],
      channels: [],
    });
  });

  it("counts a channel listed twice once", () => {
    const store = createDemoStore(NOW, {
      channels: SMALL_CHANNELS,
      videos: [],
      lists: [{ listId: "dup", name: "Dup", channelIds: ["demo-alpha", "demo-alpha"] }],
    });

    expect(store.getLists()[0].channelCount).toBe(1);
    expect(store.getList("dup")!.channelIds).toEqual(["demo-alpha"]);
  });

  it("returns null for an unknown list id in both detail and feed", () => {
    const store = listStore(roundRobinVideos());

    expect(store.getList("list-missing")).toBeNull();
    expect(store.getListFeed("list-missing", ALL)).toBeNull();
  });

  it("keeps a channel switched off in the All feed, while the All feed drops it", () => {
    const store = listStore([
      video({ videoId: "g1", channelId: "demo-gamma", hoursAgo: 1 }),
      video({ videoId: "a1", channelId: "demo-alpha", hoursAgo: 2 }),
    ]);

    store.updateChannel("demo-alpha", { enabledAll: false });

    expect(feedIds(store)).toEqual(["g1"]);
    expect(listFeedIds(store, "list-one")).toEqual(["g1", "a1"]);
  });

  it("hides a known short in a list when excludedShorts is on", () => {
    const store = listStore([
      video({ videoId: "g1", channelId: "demo-gamma", hoursAgo: 1, durationSeconds: 60 }),
      video({ videoId: "g2", channelId: "demo-gamma", hoursAgo: 2, durationSeconds: 61 }),
      video({ videoId: "g3", channelId: "demo-gamma", hoursAgo: 3, durationSeconds: null }),
      video({ videoId: "a1", channelId: "demo-alpha", hoursAgo: 4, durationSeconds: 30 }),
    ]);

    expect(listFeedIds(store, "list-one")).toEqual(["g2", "g3"]);
  });

  it("keeps a known short in a list when the channel's excludedShorts is off", () => {
    const store = listStore([
      video({ videoId: "g1", channelId: "demo-gamma", hoursAgo: 1, durationSeconds: 60 }),
      video({ videoId: "g2", channelId: "demo-gamma", hoursAgo: 2, durationSeconds: 61 }),
      video({ videoId: "g3", channelId: "demo-gamma", hoursAgo: 3, durationSeconds: null }),
      video({ videoId: "a1", channelId: "demo-alpha", hoursAgo: 4, durationSeconds: 30 }),
    ]);

    store.updateChannel("demo-gamma", { excludedShorts: false });

    expect(listFeedIds(store, "list-one")).toEqual(["g1", "g2", "g3"]);
  });

  it("drops a video whose channel is missing from the store", () => {
    const store = listStore([
      video({ videoId: "gh1", channelId: "demo-ghost", hoursAgo: 1 }),
      video({ videoId: "g1", channelId: "demo-gamma", hoursAgo: 2 }),
    ]);

    expect(listFeedIds(store, "list-one")).toEqual(["g1"]);
  });

  it("keeps only the list's channels and round robins across them", () => {
    const store = listStore(roundRobinVideos());

    expect(listFeedIds(store, "list-one")).toEqual(["g1", "a1", "g2", "a2"]);
    expect(listFeedIds(store, "list-two")).toEqual(["b1"]);
    expect(store.getListFeed("list-one", ALL)!.list).toEqual({ id: "list-one", name: "One" });
  });

  it("slices list pages and sets hasMore only when items remain", () => {
    const store = listStore(roundRobinVideos());
    const page = (offset: number, limit: number) => {
      const feed = store.getListFeed("list-one", { offset, limit })!;
      return { ids: feed.items.map((i) => i.video_id), hasMore: feed.hasMore };
    };

    expect(page(0, 3)).toEqual({ ids: ["g1", "a1", "g2"], hasMore: true });
    expect(page(3, 3)).toEqual({ ids: ["a2"], hasMore: false });
    expect(page(0, 2)).toEqual({ ids: ["g1", "a1"], hasMore: true });
    expect(page(2, 2)).toEqual({ ids: ["g2", "a2"], hasMore: false });
    expect(page(0, 4)).toEqual({ ids: ["g1", "a1", "g2", "a2"], hasMore: false });
  });

  it("shows watched state in both feeds and clears it on unwatch", () => {
    const store = listStore(roundRobinVideos());

    store.setWatched("g1");
    expect(itemFor(store.getAllFeed(ALL).items, "g1")).toMatchObject({
      is_watched: true,
      watched_at: SAVED_AT,
    });
    expect(itemFor(store.getListFeed("list-one", ALL)!.items, "g1")).toMatchObject({
      is_watched: true,
      watched_at: SAVED_AT,
    });

    store.setUnwatched("g1");
    expect(itemFor(store.getAllFeed(ALL).items, "g1")).toMatchObject({
      is_watched: false,
      watched_at: null,
    });
    expect(itemFor(store.getListFeed("list-one", ALL)!.items, "g1")).toMatchObject({
      is_watched: false,
      watched_at: null,
    });
  });

  it("returns copies of list summaries", () => {
    const store = listStore();

    const summaries = store.getLists();
    summaries[0].name = "Changed";
    summaries[0].channelCount = 99;
    summaries.pop();

    expect(store.getLists()).toEqual([
      { id: "list-one", name: "One", channelCount: 2, createdAt: SAVED_AT, updatedAt: SAVED_AT },
      { id: "list-two", name: "Two", channelCount: 1, createdAt: SAVED_AT, updatedAt: SAVED_AT },
      { id: "list-empty", name: "Empty", channelCount: 0, createdAt: SAVED_AT, updatedAt: SAVED_AT },
    ]);
  });

  it("returns copies of list details", () => {
    const store = listStore();

    const detail = store.getList("list-one")!;
    detail.name = "Changed";
    detail.channelIds.push("demo-beta");
    detail.channels[0].title = "Changed";
    detail.channels.pop();

    expect(store.getList("list-one")).toEqual(LIST_ONE_DETAIL);
  });

  it("returns copies of list feeds and their items", () => {
    const store = listStore(roundRobinVideos());

    const feed = store.getListFeed("list-one", ALL)!;
    feed.list.name = "Changed";
    feed.items[0].is_watched = true;
    feed.items[0].title = "Changed";
    feed.items.pop();

    const next = store.getListFeed("list-one", ALL)!;
    expect(next.list).toEqual({ id: "list-one", name: "One" });
    expect(next.items.map((i) => i.video_id)).toEqual(["g1", "a1", "g2", "a2"]);
    expect(next.items[0]).toMatchObject({ is_watched: false, title: "Video" });
  });

  it("copies override lists so later input mutation does not reach the store", () => {
    const lists = structuredClone(SMALL_LISTS);
    const store = createDemoStore(NOW, { channels: SMALL_CHANNELS, videos: [], lists });

    lists[0].name = "Changed";
    lists[0].channelIds.push("demo-beta");
    lists.push({ listId: "list-late", name: "Late", channelIds: ["demo-alpha"] });

    expect(store.getLists().map((l) => [l.id, l.name, l.channelCount])).toEqual([
      ["list-one", "One", 2],
      ["list-two", "Two", 1],
      ["list-empty", "Empty", 0],
    ]);
    expect(store.getList("list-one")).toEqual(LIST_ONE_DETAIL);
  });
});
