import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getLists,
  getListFeed,
  markVideoWatched,
  markVideoUnwatched,
  getLoginUrl,
  shouldRedirectToLogin,
  type ListSummary,
  type FeedItem,
} from "../lib/api";
import FeedView from "../components/FeedView";

const SELECTED_LIST_STORAGE_KEY = "betterYtTv.selectedListId";

export default function ListsPage() {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingLoginRedirect, setPendingLoginRedirect] = useState(false);

  useEffect(() => {
    if (!pendingLoginRedirect) return;
    window.location.assign(getLoginUrl());
  }, [pendingLoginRedirect]);

  function redirectIfAuthError(err: Error): boolean {
    if (shouldRedirectToLogin(err)) {
      setError("Your session expired. Redirecting to sign in...");
      setPendingLoginRedirect(true);
      return true;
    }
    return false;
  }

  async function loadLists() {
    try {
      setLoadingLists(true);
      setError(null);

      const data = await getLists();
      const loadedLists = data.lists ?? [];
      setLists(loadedLists);

      if (loadedLists.length > 0) {
        // restore the previously selected list if it still exists, else default to the first
        const stored = window.localStorage.getItem(SELECTED_LIST_STORAGE_KEY);
        const isStoredStillValid = stored && loadedLists.some((list) => list.id === stored);
        setSelectedListId(isStoredStillValid ? stored : loadedLists[0].id);
      }
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load lists");
    } finally {
      setLoadingLists(false);
    }
  }

  useEffect(() => {
    void loadLists();
  }, []);

  useEffect(() => {
    // Persist the selected list so it's remembered next time this page loads
    if (!selectedListId) return;
    window.localStorage.setItem(SELECTED_LIST_STORAGE_KEY, selectedListId);
  }, [selectedListId]);

  async function loadFeed() {
    if (!selectedListId) return;

    try {
      setLoadingFeed(true);
      setError(null);

      const data = await getListFeed(selectedListId);
      setItems(data.items ?? []);
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load list feed");
    } finally {
      setLoadingFeed(false);
    }
  }

  useEffect(() => {
    void loadFeed();
  }, [selectedListId]);

  // Re-fetch items without touching loadingFeed -- same reasoning as
  // AllPage.tsx: avoids unmounting FeedView (and the player) on every
  // watch/unwatch click.
  async function refreshItems() {
    if (!selectedListId) return;

    try {
      const data = await getListFeed(selectedListId);
      setItems(data.items ?? []);
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load list feed");
    }
  }

  async function handleSetWatched(videoId: string, watched: boolean) {
    try {
      if (watched) {
        await markVideoWatched(videoId);
      } else {
        await markVideoUnwatched(videoId);
      }

      await refreshItems();
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to update watched state");
    }
  }

  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;

  return (
    <main>
      <h1>Lists</h1>
      <p>Pick a list to watch a queue of its videos.</p>

      {loadingLists && <p>Loading lists...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {!loadingLists && !error && lists.length === 0 && (
        <p>
          You don&apos;t have any lists yet. <Link to="/settings/lists">Create one</Link>
        </p>
      )}

      {!loadingLists && !error && lists.length > 0 && (
        <>
          <div style={{ margin: "1rem 0" }}>
            <label>
              Select list:{" "}
              <select
                value={selectedListId ?? ""}
                onChange={(event) => setSelectedListId(event.target.value)}
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedList && <h2>{selectedList.name}</h2>}

          {loadingFeed && <p>Loading feed...</p>}

          {!loadingFeed && (
            <FeedView
              items={items}
              onSetWatched={handleSetWatched}
              emptyState={
                <p>
                  No videos available for this list right now.{" "}
                  <Link to={`/settings/lists/${selectedListId}`}>Manage this list</Link>
                </p>
              }
            />
          )}
        </>
      )}
    </main>
  );
}
