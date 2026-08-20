import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type FeedItem } from "../lib/api";
import YoutubePlayer, { type YoutubePlayerHandle } from "./Player/YoutubePlayer";
import MutedText from "./MutedText";
import Row from "./Row";
import Button from "./Button";
import CheckboxLabel from "./CheckboxLabel";
import Thumbnail from "./Thumbnail";
import ErrorText from "./ErrorText";

// Outlined "open eye" glyph for an unwatched video
function EyeOutlineIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Filled "open eye" glyph for a watched video
function EyeIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </svg>
  );
}

type FeedViewProps = {
  items: FeedItem[];
  onSetWatched: (videoId: string, watched: boolean) => Promise<void>;
  emptyState: ReactNode;
  // localStorage key for remembering the selected video across refreshes
  // scope this per page/list so selections dont bleed into each other, pass
  // "" to skip persistence, like before a list has finished loading
  storageKey: string;
  // omit both to hide the load more button entirely, for a page that
  // doesnt support paging yet
  hasMore?: boolean;
  onLoadMore?: () => void;
};

// Shared by AllPage, ListsPage, and LivePage: the player, Previous/Next,
// catch-up mode, and the watch/unwatch queue. Data-fetching (what "items"
// is, how it's loaded, page-specific empty-state copy) stays with each
// page; everything about navigating and displaying that feed lives here
// once, rather than being hand-copied per page like AllPage/ListsPage
// were before -- copies of this exact queue UI already produced one real
// bug (the Hide watched/Catch-up checkboxes disappearing), fixed by hand
// in two places.
export default function FeedView({
  items,
  onSetWatched,
  emptyState,
  storageKey,
  hasMore,
  onLoadMore,
}: FeedViewProps) {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [hideWatched, setHideWatched] = useState(false);
  const [catchUpMode, setCatchUpMode] = useState(true);
  const [caughtUp, setCaughtUp] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const playerRef = useRef<YoutubePlayerHandle>(null);

  useEffect(() => {
    // A playback error is specific to whatever video was selected when it
    // happened -- clear it as soon as the user moves on to a different one
    setPlayerError(false);
  }, [selectedVideoId]);

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
    // Current selection is still valid, nothing to do
    if (selectedVideoId && items.some((item) => item.video_id === selectedVideoId)) {
      return;
    }

    // Otherwise restore the last remembered video for this key if its still
    // in the feed (covers a page refresh, or switching back to a list),
    // else fall back to the first item
    const stored = storageKey ? window.localStorage.getItem(storageKey) : null;
    const isStoredValid = stored && items.some((item) => item.video_id === stored);
    setSelectedVideoId(isStoredValid ? stored : (items[0]?.video_id ?? null));
  }, [items, selectedVideoId, storageKey]);

  useEffect(() => {
    // Persist the current selection so a refresh lands back on it
    if (!storageKey || !selectedVideoId) {
      return;
    }
    window.localStorage.setItem(storageKey, selectedVideoId);
  }, [storageKey, selectedVideoId]);

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

  // Walks from the current item toward direction (1 = forward, -1 = back),
  // skipping watched items when hideWatched is on, so Previous/Next always
  // land on a video thats actually visible in the queue below
  function findAdjacentVideo(direction: 1 | -1): FeedItem | null {
    const currentIndex = getSelectedIndex(items, selectedVideoId);
    if (currentIndex === -1) {
      return null;
    }

    for (let i = currentIndex + direction; i >= 0 && i < items.length; i += direction) {
      if (!hideWatched || !items[i].is_watched) {
        return items[i];
      }
    }
    return null;
  }

  function goToPreviousVideo() {
    const previous = findAdjacentVideo(-1);
    if (previous) {
      setSelectedVideoId(previous.video_id);
      setCaughtUp(false);
    }
  }

  function goToNextVideo() {
    const next = findAdjacentVideo(1);
    if (next) {
      setSelectedVideoId(next.video_id);
      setCaughtUp(false);
    }
  }

  return (
    <>
      {selectedItem && (
        <section style={{ margin: "1.5rem 0" }}>
          <YoutubePlayer
            ref={playerRef}
            videoId={selectedItem.video_id}
            onEnded={() => {
              void handleVideoEnded();
            }}
            onError={() => setPlayerError(true)}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Button onClick={goToPreviousVideo} disabled={!findAdjacentVideo(-1)}>
              Previous
            </Button>

            {playerError && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <Button
                  onClick={() => {
                    setPlayerError(false);
                    playerRef.current?.retry();
                  }}
                >
                  Retry
                </Button>
                <ErrorText style={{ margin: 0 }}>Playback failed for this video.</ErrorText>
              </div>
            )}

            <Button onClick={goToNextVideo} disabled={!findAdjacentVideo(1)}>
              Next
            </Button>
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
              <CheckboxLabel
                checked={hideWatched}
                onChange={(e) => setHideWatched(e.target.checked)}
              >
                Hide watched
              </CheckboxLabel>
            </div>

            <div>
              <CheckboxLabel
                checked={catchUpMode}
                onChange={(event) => setCatchUpMode(event.target.checked)}
                title="Automatically play the next unwatched video when one ends."
              >
                Catch-up mode
              </CheckboxLabel>
            </div>
          </div>

          {visibleItems.length === 0 && (
            <p>All videos are watched. Turn off “Hide watched” to see them again.</p>
          )}

          {visibleItems.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {visibleItems.map((item) => {
                const isSelected = item.video_id === selectedVideoId;

                const rowClassName = [
                  "queue-row",
                  item.is_watched ? "queue-row-watched" : "",
                  isSelected ? "queue-row-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                const toggleClassName = [
                  "watch-toggle",
                  !item.is_watched ? "watch-toggle-unwatched" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <Row
                    key={item.video_id}
                    onClick={() => setSelectedVideoId(item.video_id)}
                    className={rowClassName}
                  >
                    {isSelected && (
                      <span className="queue-now-playing-marker" aria-hidden="true">
                        ▶
                      </span>
                    )}

                    <div className="queue-row-content">
                      <span className="queue-thumb">
                        <Thumbnail
                          src={item.thumb_url}
                          alt=""
                          width={120}
                          style={{
                            borderRadius: "8px",
                            flexShrink: 0,
                          }}
                        />
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: isSelected ? 700 : 500 }}>{item.title}</div>

                        <MutedText style={{ fontSize: "0.8rem" }}>
                          {item.channel_title} ·{" "}
                          {new Date(item.published_at).toLocaleString()}
                        </MutedText>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={toggleClassName}
                      aria-pressed={item.is_watched}
                      aria-label={`Mark "${item.title}" as ${
                        item.is_watched ? "unwatched" : "watched"
                      }`}
                      title={item.is_watched ? "Mark unwatched" : "Mark watched"}
                      onClick={(event) => {
                        event.stopPropagation();
                        void onSetWatched(item.video_id, !item.is_watched);
                      }}
                    >
                      {item.is_watched ? <EyeOutlineIcon /> : <EyeIcon />}
                    </button>
                  </Row>
                );
              })}
            </ul>
          )}

          {hasMore && onLoadMore && (
            <div style={{ textAlign: "center", margin: "1rem 0" }}>
              <Button onClick={onLoadMore}>Load more</Button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
