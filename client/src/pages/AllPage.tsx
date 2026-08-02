import { useEffect, useState, useMemo } from "react";
import { 
  getAllFeed, 
  markVideoWatched,
  markVideoUnwatched,
  getLoginUrl,
  shouldRedirectToLogin,
} from "../lib/api";
import YoutubePlayer from "../components/Player/YoutubePlayer";

type FeedItem = {
  video_id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  published_at: string;
  thumb_url: string | null;
  watched_at: string | null;
  is_watched: boolean;
};

export default function AllPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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

  async function loadFeed() {
    try {
      setLoading(true);
      setError(null);

      // Load the DB feed data for this user
      const data = await getAllFeed();
      const nextItems = data.items ?? [];
      setItems(data.items ?? []);

      // If nothing is selected yet, default to the first item in the queue
      if (!selectedVideoId && nextItems.length > 0) {
        setSelectedVideoId(nextItems[0].video_id);
      }

      // If the currently selected video disappeared from the list, fall back to first item
      if (
        selectedVideoId &&
        !nextItems.some((item: FeedItem) => item.video_id === selectedVideoId)
      ) {
        setSelectedVideoId(nextItems[0]?.video_id ?? null);
      }
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load /all feed");
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    // Load the user's saved catch-up preference once on first render
    const saved = window.localStorage.getItem("betterYtTv.catchUpMode");

    // If a saved preference exists, convert string "true"/"false" into a boolean
    if (saved !== null) {
      setCatchUpMode(saved === "true");
    }
  }, []);

  useEffect(() => {
    // Persist the current catch-up setting
    window.localStorage.setItem("betterYtTv.catchUpMode", String(catchUpMode));
  }, [catchUpMode]);


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

    // If current item isn't found, fall back to the first unwatched video
    if (currentIndex === -1) {
      return items.find((item) => !item.is_watched) ?? null;
    }

    // Search forward from the current item to find the next unwatched video
    for (let i = currentIndex + 1; i < items.length; i += 1) {
      if (!items[i].is_watched) {
        return items[i];
      }
    }

    // If nothing later in the list is unwatched, we are caught up.
    return null;
  }

async function handleVideoEnded() {
  if (!selectedItem) {
    return;
  }

  try {
    setError(null);
    setCaughtUp(false);

    // Mark the video just finished as watched on the server
    await markVideoWatched(selectedItem.video_id);

    // Update local item state without waiting for feed to reload
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

    // If catch-up mode is OFF, stop here
    if (!catchUpMode) {
      return;
    }

    // Find the next unwatched video after the one that just ended
    const nextItem = findNextUnwatchedVideo(updatedItems, selectedItem.video_id);

    if (nextItem) {
      setSelectedVideoId(nextItem.video_id);
    } else {
      // No unwatched videos remain
      setCaughtUp(true);
    }
  } catch (err) {
    if (redirectIfAuthError(err)) return;
    setError(err instanceof Error ? err.message : "Failed to advance queue");
  }
}

  const selectedItem = items.find((item) => item.video_id === selectedVideoId) ?? null;

  // when watched videos are toggled as hidden by user
  const visibleItems = useMemo(() => {
    // V1: filter watched videos client side only
    if (!hideWatched) {
      return items;
    }

    return items.filter((item) => !item.is_watched);
  }, [items, hideWatched]);

  useEffect(() => {
    // discard promise to ensure useEffect returns nothing/undefined
    void loadFeed();
  }, []); // run once when component first mounts

  // return specified index from list of videos
  function getSelectedIndex(items: FeedItem[], selectedVideoId: string | null) {
    if (!selectedVideoId) {
      return -1;
    }

    return items.findIndex((item) => item.video_id === selectedVideoId);
  }

  function goToPreviousVideo() {
    const currentIndex = getSelectedIndex(items, selectedVideoId);

    // If the first item, or nothing, is selected, do nothing
    if (currentIndex <= 0) {
      return;
    }

    setSelectedVideoId(items[currentIndex - 1].video_id);
    setCaughtUp(false);
  }

  function goToNextVideo() {
    const currentIndex = getSelectedIndex(items, selectedVideoId);

    // If nothing is selected or we're already at the last item, do nothing
    if (currentIndex === -1 || currentIndex >= items.length - 1) {
      return;
    }

    setSelectedVideoId(items[currentIndex + 1].video_id);
    setCaughtUp(false);
  }

  return (
    <main>
      <h1>All Videos</h1>

      <p>
        A queue of recent videos from channels you follow.
      </p>

      {selectedItem && (
        <section style={{ margin: "1.5rem 0" }}>

          <YoutubePlayer
            videoId={selectedItem.video_id}
            onEnded={() => {
              void handleVideoEnded();
            }}
          />
          <div
            style={{display: "flex", gap: "50%", justifyContent:"center"}}
          >
            <button onClick={goToPreviousVideo}>Previous</button>
            <button onClick={goToNextVideo}>Next</button>
            
          </div>


          <p style={{margin:"10px"}}>
            <strong>{selectedItem.title} </strong>
             -
            <strong> {selectedItem.channel_title}</strong>
          </p>

        </section>
      )}

      {loading && <p>Loading feed...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p>No videos yet. Try building the feed.</p>
      )}

      {!loading && !error && items.length > 0 && visibleItems.length === 0 && (
        <p>All videos are watched. Turn off “Hide watched” to see them again.</p>
      )}

      {caughtUp && (
        <p style={{ color: "#555", marginTop: "0.75rem" }}>
          You&apos;re caught up — no unwatched videos remain.
        </p>
      )}



     {!loading && !error && visibleItems.length > 0 && (
        <section>
          {/* TODO make this its own video queue component */}
          <h2 style={{ marginBottom: "1rem" }}>Queue</h2>

          <div style={{ display: "flex", margin:"1rem 0", gap:"1rem", justifyContent:"center"}}>
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

                  {/* Main text area: title first, then compact metadata line */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: isSelected ? 700 : 500,
                      }}
                    >
                      {item.title}
                    </div>

                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "#666",
                      }}
                    >
                      {item.channel_title} ·{" "}
                      {new Date(item.published_at).toLocaleString()}
                    </div>
                  </div>

                  {/* Keep actions/status small and to the right */}
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
                      style={{
                        marginRight: ".5rem",
                      }}
                      onClick={(event) => {
                        // Prevent row click from also changing selection unexpectedly.
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
      )}    </main>
  );
}
