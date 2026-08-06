import { useEffect, useMemo, useState, type ReactNode } from "react";
import { type FeedItem } from "../lib/api";
import YoutubePlayer from "./Player/YoutubePlayer";
import MutedText from "./MutedText";
import Row from "./Row";

type FeedViewProps = {
  items: FeedItem[];
  onSetWatched: (videoId: string, watched: boolean) => Promise<void>;
  emptyState: ReactNode;
};

// Shared by AllPage, ListsPage, and LivePage: the player, Previous/Next,
// catch-up mode, and the watch/unwatch queue. Data-fetching (what "items"
// is, how it's loaded, page-specific empty-state copy) stays with each
// page; everything about navigating and displaying that feed lives here
// once, rather than being hand-copied per page like AllPage/ListsPage
// were before -- copies of this exact queue UI already produced one real
// bug (the Hide watched/Catch-up checkboxes disappearing), fixed by hand
// in two places.
export default function FeedView({ items, onSetWatched, emptyState }: FeedViewProps) {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [hideWatched, setHideWatched] = useState(false);
  const [catchUpMode, setCatchUpMode] = useState(true);
  const [caughtUp, setCaughtUp] = useState(false);

  useEffect(() => {
    // Load the user's saved catch-up preference once on first render
    const saved = window.localStorage.getItem("betterYtTv.catchUpMode");
    if (saved !== null) {
      setCatchUpMode(saved === "true");
    }
  }, []);

  useEffect(() => {
    // Persist the current catch-up setting
    window.localStorage.setItem("betterYtTv.catchUpMode", String(catchUpMode));
  }, [catchUpMode]);

  useEffect(() => {
    // Default to the first item if nothing is selected yet, or fall back to
    // the first item if the previously selected video is no longer present
    // (feed reloaded, or -- for ListsPage -- the user switched lists)
    if (!selectedVideoId && items.length > 0) {
      setSelectedVideoId(items[0].video_id);
      return;
    }

    if (selectedVideoId && !items.some((item) => item.video_id === selectedVideoId)) {
      setSelectedVideoId(items[0]?.video_id ?? null);
    }
  }, [items, selectedVideoId]);

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
      setCaughtUp(false);

      await onSetWatched(selectedItem.video_id, true);

      // Compute the local view of "just watched" from the current items
      // prop, so we can advance immediately without waiting on the
      // parent's refetch to resolve
      const updatedItems = items.map((item) =>
        item.video_id === selectedItem.video_id
          ? {
              ...item,
              is_watched: true,
              watched_at: new Date().toISOString(),
            }
          : item,
      );

      // If catch-up mode is OFF, stop here
      if (!catchUpMode) {
        return;
      }

      const nextItem = findNextUnwatchedVideo(updatedItems, selectedItem.video_id);

      if (nextItem) {
        setSelectedVideoId(nextItem.video_id);
      } else {
        // No unwatched videos remain
        setCaughtUp(true);
      }
    } catch {
      // onSetWatched already surfaces failures via the parent's error state
    }
  }

  const selectedItem = items.find((item) => item.video_id === selectedVideoId) ?? null;

  // when watched videos are toggled as hidden by user
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
    <>
      {selectedItem && (
        <section style={{ margin: "1.5rem 0" }}>
          <YoutubePlayer
            videoId={selectedItem.video_id}
            onEnded={() => {
              void handleVideoEnded();
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button
              onClick={goToPreviousVideo}
              disabled={getSelectedIndex(items, selectedVideoId) <= 0}
            >
              Previous
            </button>
            <button
              onClick={goToNextVideo}
              disabled={
                getSelectedIndex(items, selectedVideoId) === -1 ||
                getSelectedIndex(items, selectedVideoId) >= items.length - 1
              }
            >
              Next
            </button>
          </div>

          <p style={{ margin: "10px" }}>
            <strong>{selectedItem.title} </strong>-
            <strong> {selectedItem.channel_title}</strong>
          </p>
        </section>
      )}

      {items.length === 0 && emptyState}

      {caughtUp && (
        <p style={{ color: "#555", marginTop: "0.75rem" }}>
          You&apos;re caught up — no unwatched videos remain.
        </p>
      )}

      {items.length > 0 && (
        <section>
          <h2 style={{ marginBottom: "1rem" }}>Queue</h2>

          <div
            style={{ display: "flex", margin: "1rem 0", gap: "1rem", justifyContent: "center" }}
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

          {visibleItems.length === 0 && (
            <p>All videos are watched. Turn off “Hide watched” to see them again.</p>
          )}

          {visibleItems.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {visibleItems.map((item) => {
                const isSelected = item.video_id === selectedVideoId;

                return (
                  <Row
                    key={item.video_id}
                    onClick={() => setSelectedVideoId(item.video_id)}
                    style={{
                      gap: "1rem",
                      padding: "0.5rem 0",
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

                      <MutedText style={{ fontSize: "0.8rem" }}>
                        {item.channel_title} ·{" "}
                        {new Date(item.published_at).toLocaleString()}
                      </MutedText>
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
                          void onSetWatched(item.video_id, !item.is_watched);
                        }}
                      >
                        {item.is_watched ? "Unwatch" : "Watch"}
                      </button>
                    </div>
                  </Row>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
