import { useEffect, useState, useMemo } from "react";
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
import YoutubePlayer from "../components/Player/YoutubePlayer";

const SELECTED_LIST_STORAGE_KEY = "betterYtTv.selectedListId";

export default function ListsPage() {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hideWatched, setHideWatched] = useState(false);
  const [catchUpMode, setCatchUpMode] = useState(true);
  const [caughtUp, setCaughtUp] = useState(false);
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

  useEffect(() => {
    // Share the same catch-up preference as /all -- it's a general playback
    // preference, not something worth asking the user to set separately
    // per page.
    const saved = window.localStorage.getItem("betterYtTv.catchUpMode");
    if (saved !== null) {
      setCatchUpMode(saved === "true");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("betterYtTv.catchUpMode", String(catchUpMode));
  }, [catchUpMode]);

  async function loadFeed() {
    if (!selectedListId) return;

    try {
      setLoadingFeed(true);
      setError(null);
      setCaughtUp(false);

      const data = await getListFeed(selectedListId);
      const nextItems = data.items ?? [];
      setItems(nextItems);

      // If nothing is selected yet, default to the first item in the queue
      if (!selectedVideoId && nextItems.length > 0) {
        setSelectedVideoId(nextItems[0].video_id);
      }

      // If the currently selected video isn't in this list (e.g. we just
      // switched lists, or it disappeared), fall back to the first item
      if (
        selectedVideoId &&
        !nextItems.some((item) => item.video_id === selectedVideoId)
      ) {
        setSelectedVideoId(nextItems[0]?.video_id ?? null);
      }
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

  async function handleToggleWatched(item: FeedItem) {
    try {
      if (item.is_watched) {
        await markVideoUnwatched(item.video_id);
      } else {
        await markVideoWatched(item.video_id);
      }

      // Reload feed after toggle so ordering and watched state stay accurate
      await loadFeed();
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to update watched state");
    }
  }

  function findNextUnwatchedVideo(items: FeedItem[], currentVideoId: string) {
    const currentIndex = items.findIndex((item) => item.video_id === currentVideoId);

    if (currentIndex === -1) {
      return items.find((item) => !item.is_watched) ?? null;
    }

    for (let i = currentIndex + 1; i < items.length; i += 1) {
      if (!items[i].is_watched) {
        return items[i];
      }
    }

    return null;
  }

  async function handleVideoEnded() {
    if (!selectedItem) {
      return;
    }

    try {
      setError(null);
      setCaughtUp(false);

      await markVideoWatched(selectedItem.video_id);

      const updatedItems = items.map((item) =>
        item.video_id === selectedItem.video_id
          ? {
              ...item,
              is_watched: true,
              watched_at: new Date().toISOString(),
            }
          : item,
      );

      setItems(updatedItems);

      if (!catchUpMode) {
        return;
      }

      const nextItem = findNextUnwatchedVideo(updatedItems, selectedItem.video_id);

      if (nextItem) {
        setSelectedVideoId(nextItem.video_id);
      } else {
        setCaughtUp(true);
      }
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to advance queue");
    }
  }

  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;
  const selectedItem = items.find((item) => item.video_id === selectedVideoId) ?? null;

  const visibleItems = useMemo(() => {
    if (!hideWatched) {
      return items;
    }
    return items.filter((item) => !item.is_watched);
  }, [items, hideWatched]);

  function getSelectedIndex(items: FeedItem[], selectedVideoId: string | null) {
    if (!selectedVideoId) {
      return -1;
    }
    return items.findIndex((item) => item.video_id === selectedVideoId);
  }

  function goToPreviousVideo() {
    const currentIndex = getSelectedIndex(items, selectedVideoId);
    if (currentIndex <= 0) {
      return;
    }
    setSelectedVideoId(items[currentIndex - 1].video_id);
    setCaughtUp(false);
  }

  function goToNextVideo() {
    const currentIndex = getSelectedIndex(items, selectedVideoId);
    if (currentIndex === -1 || currentIndex >= items.length - 1) {
      return;
    }
    setSelectedVideoId(items[currentIndex + 1].video_id);
    setCaughtUp(false);
  }

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
                onChange={(event) => {
                  setSelectedListId(event.target.value);
                  setSelectedVideoId(null);
                }}
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

          {selectedItem && (
            <section style={{ margin: "1.5rem 0" }}>
              <YoutubePlayer
                videoId={selectedItem.video_id}
                onEnded={() => {
                  void handleVideoEnded();
                }}
              />
              <div style={{ display: "flex", gap: "50%", justifyContent: "center" }}>
                <button onClick={goToPreviousVideo}>Previous</button>
                <button onClick={goToNextVideo}>Next</button>
              </div>

              <p style={{ margin: "10px" }}>
                <strong>{selectedItem.title} </strong>-
                <strong> {selectedItem.channel_title}</strong>
              </p>
            </section>
          )}

          {loadingFeed && <p>Loading feed...</p>}

          {!loadingFeed && items.length === 0 && (
            <p>
              No videos available for this list right now.{" "}
              <Link to={`/settings/lists/${selectedListId}`}>Manage this list</Link>
            </p>
          )}

          {!loadingFeed && items.length > 0 && visibleItems.length === 0 && (
            <p>All videos are watched. Turn off "Hide watched" to see them again.</p>
          )}

          {caughtUp && (
            <p style={{ color: "#555", marginTop: "0.75rem" }}>
              You&apos;re caught up, no unwatched videos remain.
            </p>
          )}

          {!loadingFeed && visibleItems.length > 0 && (
            <section>
              <h2 style={{ marginBottom: "1rem" }}>Queue</h2>

              <div
                style={{
                  display: "flex",
                  margin: "1rem 0",
                  gap: "1rem",
                  justifyContent: "center",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={hideWatched}
                      onChange={(e) => setHideWatched(e.target.checked)}
                    />
                    <span>Hide watched</span>
                  </label>
                </div>

                <div>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                    }}
                    title="Automatically play the next unwatched video when one ends."
                  >
                    <input
                      type="checkbox"
                      checked={catchUpMode}
                      onChange={(event) => setCatchUpMode(event.target.checked)}
                    />
                    <span>Catch-up mode</span>
                  </label>
                </div>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {visibleItems.map((item) => {
                  const isSelected = item.video_id === selectedVideoId;

                  return (
                    <li
                      key={item.video_id}
                      onClick={() => setSelectedVideoId(item.video_id)}
                      style={{
                        display: "flex",
                        gap: "1rem",
                        alignItems: "center",
                        padding: "0.5rem 0",
                        borderTop: "1px solid #2e303a",
                        cursor: "pointer",
                        opacity: item.is_watched ? 0.5 : 1,
                        backgroundColor: isSelected ? "#333" : "transparent",
                      }}
                    >
                      {item.thumb_url && (
                        <img
                          src={item.thumb_url}
                          alt={item.title}
                          width={120}
                          style={{
                            borderRadius: "8px",
                            flexShrink: 0,
                          }}
                        />
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: isSelected ? 700 : 500 }}>{item.title}</div>

                        <div style={{ fontSize: "0.8rem", color: "#666" }}>
                          {item.channel_title} ·{" "}
                          {new Date(item.published_at).toLocaleString()}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: "0.5rem",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.8rem",
                            color: item.is_watched ? "#777" : "#111",
                            paddingRight: ".5rem",
                          }}
                        >
                          {item.is_watched ? "Watched" : "Unwatched"}
                        </span>

                        <button
                          style={{ marginRight: ".5rem" }}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggleWatched(item);
                          }}
                        >
                          {item.is_watched ? "Unwatch" : "Watch"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
