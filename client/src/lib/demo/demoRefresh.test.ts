import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEMO_CACHED_VIDEOS, DEMO_REFRESHED_CHANNELS, demoRefreshResult } from "./demoRefresh";
import { DEMO_REFRESH_DELAY_MS } from "./latency";
import { DEMO_CHANNELS, DEMO_VIDEOS } from "./fixtures";

describe("demo refresh counts", () => {
  it("matches the fixture channel count", () => {
    expect(DEMO_REFRESHED_CHANNELS).toBe(DEMO_CHANNELS.length);
  });

  it("matches the fixture video count", () => {
    expect(DEMO_CACHED_VIDEOS).toBe(DEMO_VIDEOS.length);
  });
});

describe("demo refresh timing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds a manual refresh for DEMO_REFRESH_DELAY_MS", async () => {
    let settled = false;
    const pending = demoRefreshResult(true).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(DEMO_REFRESH_DELAY_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({
      ok: true,
      refreshPaused: false,
      refreshedChannels: DEMO_REFRESHED_CHANNELS,
      skippedChannels: 0,
      failedChannels: 0,
      cachedVideos: DEMO_CACHED_VIDEOS,
    });
  });

  it("resolves a background refresh without waiting", async () => {
    const result = await demoRefreshResult(false);

    expect(result).toEqual({
      ok: true,
      refreshPaused: false,
      refreshedChannels: 0,
      skippedChannels: 0,
      failedChannels: 0,
      cachedVideos: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
