import type { RefreshAllCacheResult } from "../api";
import { DEMO_REFRESH_DELAY_MS, demoLatency } from "./latency";

// canned counts for the demo refresh result
export const DEMO_REFRESHED_CHANNELS = 11;
export const DEMO_CACHED_VIDEOS = 60;

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
