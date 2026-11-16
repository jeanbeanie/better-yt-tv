import type { SavedListVideo } from "./api";
import { prefStorageKey } from "./demo/prefStorageKey";

// matches the storageKey prop ListsPage passes to FeedView
const SAVED_LIST_VIDEO_PREFIX = "betterYtTv.selectedVideoId.list.";

// same cap as SUMMARY_RESUME_LIMIT in server lists.ts
const MAX_SAVED_LIST_VIDEOS = 100;

const LIST_ID_PATTERN = /^[A-Za-z0-9-]+$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function savedListVideoKey(listId: string): string {
  return prefStorageKey(`${SAVED_LIST_VIDEO_PREFIX}${listId}`);
}

// saved video per list for the current mode, malformed entries skipped
export function readSavedListVideos(): SavedListVideo[] {
  const prefix = prefStorageKey(SAVED_LIST_VIDEO_PREFIX);
  const saved: SavedListVideo[] = [];

  for (let i = 0; i < window.localStorage.length && saved.length < MAX_SAVED_LIST_VIDEOS; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;

    const listId = key.slice(prefix.length);
    const videoId = window.localStorage.getItem(key);
    if (!LIST_ID_PATTERN.test(listId)) continue;
    if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) continue;

    saved.push({ listId, videoId });
  }

  return saved;
}

export function saveListVideo(listId: string, videoId: string): void {
  window.localStorage.setItem(savedListVideoKey(listId), videoId);
}
