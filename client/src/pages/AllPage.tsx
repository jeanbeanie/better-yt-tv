import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAllFeed,
  markVideoWatched,
  markVideoUnwatched,
  getLoginUrl,
  shouldRedirectToLogin,
  refreshAllCache,
  type FeedItem,
} from "../lib/api";
import FeedView from "../components/FeedView";
import ErrorText from "../components/ErrorText";
import Spinner from "../components/Spinner";

const DEFAULT_LIMIT = 50;

export default function AllPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingLoginRedirect, setPendingLoginRedirect] = useState(false);

  useEffect(() => {
    if (!pendingLoginRedirect) return;
    window.location.assign(getLoginUrl());
  }, [pendingLoginRedirect]);

  function redirectIfAuthError(err: unknown): boolean {
    if (shouldRedirectToLogin(err)) {
      setError("Your session expired. Redirecting to sign in...");
      setPendingLoginRedirect(true);
      return true;
    }
    return false;
  }

  async function loadFeed() {
    try {
      setLoading(true);
      setError(null);

      const data = await getAllFeed({ limit: DEFAULT_LIMIT });
      setItems(data.items ?? []);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load /all feed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFeed();
  }, []);

  // re-fetch at least as many items as are already loaded, so a
  // background refresh doesnt collapse how far youve scrolled
  async function refreshItems() {
    try {
      const data = await getAllFeed({ limit: Math.max(items.length, DEFAULT_LIMIT) });
      setItems(data.items ?? []);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load /all feed");
    }
  }

  // keeps backgroundRefresh from calling a stale refreshItems,
  // same pattern as ListsPage.tsx
  const refreshItemsRef = useRef(refreshItems);
  useEffect(() => {
    refreshItemsRef.current = refreshItems;
  });

  // silently refresh the video cache on every visit
  useEffect(() => {
    async function backgroundRefresh() {
      try {
        await refreshAllCache();
        await refreshItemsRef.current();
      } catch (err) {
        console.error("Background cache refresh failed:", err);
      } finally {
        setRefreshing(false);
      }
    }
    void backgroundRefresh();
  }, []);

  async function loadMore() {
    try {
      const data = await getAllFeed({ offset: items.length, limit: DEFAULT_LIMIT });
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load more videos");
    }
  }

  async function handleSetWatched(videoId: string, watched: boolean) {
    try {
      if (watched) {
        await markVideoWatched(videoId);
      } else {
        await markVideoUnwatched(videoId);
      }

      // refresh silently so ordering and watched state stay accurate
      // without flashing the whole page
      await refreshItems();
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to update watched state");
    }
  }

  return (
    <main>
      <h1>All Videos</h1>

      <p>A queue of recent videos from channels you follow.</p>

      {loading && <Spinner label="Loading feed..." />}
      {error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && items.length === 0 && refreshing && (
        <Spinner label="Fetching your videos, this may take a moment the first time..." />
      )}

      {!loading && !error && !(items.length === 0 && refreshing) && (
        <FeedView
          items={items}
          onSetWatched={handleSetWatched}
          storageKey="betterYtTv.selectedVideoId.all"
          hasMore={hasMore}
          onLoadMore={loadMore}
          emptyState={
            <p>
              No videos yet. Try building the feed in the{" "}
              <Link to="/settings/channels">settings page</Link>.
            </p>
          }
        />
      )}
    </main>
  );
}
