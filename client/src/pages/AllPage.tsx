import { useEffect, useState } from "react";
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

export default function AllPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
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

      const data = await getAllFeed();
      setItems(data.items ?? []);
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

  // Silently refresh the video cache on every visit -- refreshAllCache is
  // cheap to call repeatedly since stale channels are TTL-gated server-side,
  // and re-fetching afterward means a channel that's never been refreshed
  // before can actually populate on this same visit, not just the next one
  useEffect(() => {
    async function backgroundRefresh() {
      try {
        await refreshAllCache();
        await refreshItems();
      } catch (err) {
        console.error("Background cache refresh failed:", err);
      } finally {
        setRefreshing(false);
      }
    }
    void backgroundRefresh();
  }, []);

  // Re-fetch items without touching `loading` -- unlike loadFeed(), this
  // doesn't unmount/remount FeedView (and the YouTube player inside it) on
  // every watch/unwatch click. loadFeed() stays reserved for the initial
  // mount, where showing "Loading feed..." is actually wanted.
  async function refreshItems() {
    try {
      const data = await getAllFeed();
      setItems(data.items ?? []);
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load /all feed");
    }
  }

  async function handleSetWatched(videoId: string, watched: boolean) {
    try {
      if (watched) {
        await markVideoWatched(videoId);
      } else {
        await markVideoUnwatched(videoId);
      }

      // Refresh silently so ordering and watched state stay accurate
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

      {loading && <p>Loading feed...</p>}
      {error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && items.length === 0 && refreshing && (
        <Spinner label="Fetching your videos, this may take a moment the first time..." />
      )}

      {!loading && !error && !(items.length === 0 && refreshing) && (
        <FeedView
          items={items}
          onSetWatched={handleSetWatched}
          storageKey="betterYtTv.selectedVideoId.all"
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
