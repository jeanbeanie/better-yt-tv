import { describe, it, expect, beforeEach } from "vitest";
import {
  applyRoundRobin,
  createDemoStore,
  getDemoStore,
  resetDemoStore,
  type DemoStore,
} from "./store";
import { DEMO_CHANNELS, type DemoVideo } from "./fixtures";
import type { FeedItem } from "../api";

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
