import type { RefreshAllCacheResult } from "../api";
import { DEMO_REFRESH_DELAY_MS, demoLatency } from "./latency";
import { DEMO_CHANNELS, DEMO_VIDEOS } from "./fixtures";

// canned counts for the demo refresh result
export const DEMO_REFRESHED_CHANNELS = DEMO_CHANNELS.length;
export const DEMO_CACHED_VIDEOS = DEMO_VIDEOS.length;

export async function demoRefreshResult(manual: boolean): Promise<RefreshAllCacheResult> {
  if (manual) {
    // manual only, background refresh stays instant
    await demoLatency(DEMO_REFRESH_DELAY_MS);
    return {
      ok: true,
      refreshPaused: false,
      refreshedChannels: DEMO_REFRESHED_CHANNELS,
      skippedChannels: 0,
      failedChannels: 0,
      cachedVideos: DEMO_CACHED_VIDEOS,
    };
  }
  return {
    ok: true,
    refreshPaused: false,
    refreshedChannels: 0,
    skippedChannels: 0,
    failedChannels: 0,
    cachedVideos: 0,
  };
}
