import { describe, it, expect } from "vitest";
import { DEMO_CHANNELS, DEMO_LISTS, DEMO_VIDEOS } from "./fixtures";

describe("demo fixtures", () => {
  it("has 11 unique channels", () => {
    expect(DEMO_CHANNELS).toHaveLength(11);
    const ids = new Set(DEMO_CHANNELS.map((c) => c.channelId));
    expect(ids.size).toBe(DEMO_CHANNELS.length);
  });

  it("has more than 50 unique videos", () => {
    expect(DEMO_VIDEOS.length).toBeGreaterThan(50);
    const ids = new Set(DEMO_VIDEOS.map((v) => v.videoId));
    expect(ids.size).toBe(DEMO_VIDEOS.length);
  });

  it("points every video at a known channel", () => {
    const channelIds = new Set(DEMO_CHANNELS.map((c) => c.channelId));
    for (const v of DEMO_VIDEOS) {
      expect(channelIds.has(v.channelId)).toBe(true);
    }
  });

  it("gives every channel at least 4 videos", () => {
    for (const c of DEMO_CHANNELS) {
      const count = DEMO_VIDEOS.filter((v) => v.channelId === c.channelId).length;
      expect(count).toBeGreaterThanOrEqual(4);
    }
  });

  it("uses mqdefault thumbnails derived from videoId", () => {
    for (const v of DEMO_VIDEOS) {
      expect(v.thumbUrl).toBe(`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`);
    }
  });

  it("has distinct positive hoursAgo values", () => {
    for (const v of DEMO_VIDEOS) {
      expect(v.hoursAgo).toBeGreaterThan(0);
    }
    const hours = new Set(DEMO_VIDEOS.map((v) => v.hoursAgo));
    expect(hours.size).toBe(DEMO_VIDEOS.length);
  });

  it("keeps durationSeconds null or a positive integer", () => {
    for (const v of DEMO_VIDEOS) {
      if (v.durationSeconds === null) continue;
      expect(Number.isInteger(v.durationSeconds)).toBe(true);
      expect(v.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("includes at least 2 short clips and exactly 1 clip between 61 and 90 seconds", () => {
    const durations = DEMO_VIDEOS.map((v) => v.durationSeconds).filter(
      (d): d is number => d !== null,
    );
    expect(durations.filter((d) => d <= 60).length).toBeGreaterThanOrEqual(2);
    expect(durations.filter((d) => d >= 61 && d <= 90)).toHaveLength(1);
  });

  it("starts channels with all prefs on and no thumbnail", () => {
    for (const c of DEMO_CHANNELS) {
      expect(c.enabledAll).toBe(true);
      expect(c.enabledLive).toBe(true);
      expect(c.excludedShorts).toBe(true);
      expect(c.thumbUrl).toBeNull();
    }
  });
});

describe("demo list fixtures", () => {
  it("gives every list a unique id and name", () => {
    expect(new Set(DEMO_LISTS.map((l) => l.listId)).size).toBe(DEMO_LISTS.length);
    expect(new Set(DEMO_LISTS.map((l) => l.name)).size).toBe(DEMO_LISTS.length);
  });

  it("points every list channel at a known channel", () => {
    const channelIds = new Set(DEMO_CHANNELS.map((c) => c.channelId));
    for (const l of DEMO_LISTS) {
      for (const channelId of l.channelIds) {
        expect(channelIds.has(channelId)).toBe(true);
      }
    }
  });

  it("lists each channel at most once per list", () => {
    for (const l of DEMO_LISTS) {
      expect(new Set(l.channelIds).size).toBe(l.channelIds.length);
    }
  });

  it("keeps every list non empty", () => {
    for (const l of DEMO_LISTS) {
      expect(l.channelIds.length).toBeGreaterThan(0);
    }
  });

  it("puts at least one channel in two lists", () => {
    const counts = new Map<string, number>();
    for (const l of DEMO_LISTS) {
      for (const channelId of l.channelIds) {
        counts.set(channelId, (counts.get(channelId) ?? 0) + 1);
      }
    }
    expect([...counts.values()].some((n) => n >= 2)).toBe(true);
  });

  it("leaves demo-blender out of every list", () => {
    for (const l of DEMO_LISTS) {
      expect(l.channelIds).not.toContain("demo-blender");
    }
  });
});
