import type { RefreshAllCacheResult } from "../api";

// canned counts for the demo refresh result
export const DEMO_REFRESHED_CHANNELS = 10;
export const DEMO_CACHED_VIDEOS = 40;

export function demoRefreshResult(manual: boolean): RefreshAllCacheResult {
  if (manual) {
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
