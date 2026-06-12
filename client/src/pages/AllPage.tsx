import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllFeed, syncSubscriptions, refreshAllCache } from "../lib/api";

type FeedItem = {
  video_id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  published_at: string;
  thumb_url: string | null;
};

type RefreshResult = {
  ok: boolean;
  refreshedChannels: number;
  skippedChannels?: number;
  cachedVideos: number;
};

export default function AllPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
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
      setItems(data.items ?? []);
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

  useEffect(() => {
    // discard promise to ensure useEffect returns nothing/undefined
    void loadFeed();
  }, []); // run once when component first mounts

  return (
    <main>
      <nav style={{ marginBottom: "1rem" }}>
        <Link to="/">← Back home</Link>
      </nav>

      <h1>All Videos Feed</h1>

      <p>
        /all showing recemt cached videos from channels you follow
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

      {loading && <p>Loading feed...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p>No videos yet. Try building the feed.</p>
      )}

      <ul>
        {items.map((item) => (
          <li key={item.video_id}>
            {item.thumb_url && (
              <img
                src={item.thumb_url}
                alt={item.title}
              />
            )}
            <p>{item.title}</p>
            <p>{item.published_at}</p>
            <p>{item.channel_title}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
