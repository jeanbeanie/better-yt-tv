import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  getAllFeed, 
  syncSubscriptions, 
  refreshAllCache,
  markVideoWatched,
  markVideoUnwatched,
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

type RefreshResult = {
  ok: boolean;
  refreshedChannels: number;
  skippedChannels?: number;
  cachedVideos: number;
};

export default function AllPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);

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
      setError(err instanceof Error ? err.message : "Failed to load /all feed");
    } finally {
      setLoading(false);
    }
  }

  async function handleInitialBuild() {
    try {
      setBusy(true);
      setError(null);
      setRefreshResult(null);

      // Pull subscriptions from YouTube into DB
      await syncSubscriptions();

      // pull recent videos for those channels into DB
      const refresh = await refreshAllCache();
      setRefreshResult(refresh);

      // then reload the page data from our own backend
      await loadFeed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync subscriptions");
    } finally {
      setBusy(false);
    }
  }

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
      setError(err instanceof Error ? err.message : "Failed to update watched state");
    }
  }


  const selectedItem = useMemo(
    () => items.find((item) => item.video_id === selectedVideoId) ?? null,
    [items, selectedVideoId],
  );

  useEffect(() => {
    // discard promise to ensure useEffect returns nothing/undefined
    void loadFeed();
  }, []); // run once when component first mounts

  return (
    <main>
      <nav style={{ marginBottom: "1rem" }}>
        <Link to="/">← Back home</Link>
      </nav>

      <h1>All Videos</h1>

      <p>
        A queue of recent videos from channels you follow.
      </p>

      <button onClick={() => void handleInitialBuild()} disabled={busy}>
        {busy ? "Building feed..." : "Build/Refresh Feed"}
      </button>

      {refreshResult && (
        <p>
          Refreshed {refreshResult.refreshedChannels} channels, skipped{" "}
          {refreshResult.skippedChannels ?? 0}, cached {refreshResult.cachedVideos} videos.
        </p>
      )}


      {selectedItem && (
        <section style={{ margin: "1.5rem 0" }}>
          <h2>Now Playing</h2>
          <p>
            <strong>{selectedItem.title}</strong>
            <br />
            {selectedItem.channel_title}
          </p>

          <YoutubePlayer
            videoId={selectedItem.video_id}
            onEnded={() => {
              console.log("video ended", selectedItem.video_id);
            }}
          />
        </section>
      )}

      {loading && <p>Loading feed...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p>No videos yet. Try building the feed.</p>
      )}

     {!loading && !error && items.length > 0 && (
        <section>
          {/* TODO make this its own video queue component */}
          <h2 style={{ marginBottom: "1rem" }}>Queue</h2>

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((item) => {
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
