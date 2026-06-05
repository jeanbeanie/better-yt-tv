import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllFeed, syncSubscriptions } from "../lib/api";

type FeedItem = {
  channel_id: string;
  channel_title: string;
};

export default function AllPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSync() {
    try {
      setSyncing(true);
      setError(null);

      // Pull subscriptions from YouTube into the DB
      // then reload the page data from our own backend
      await syncSubscriptions();
      await loadFeed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync subscriptions");
    } finally {
      setSyncing(false);
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

      <h1>All Feed</h1>

      <p>
        /all showing all subs from db for nowww
      </p>

      <button onClick={() => void handleSync()} disabled={syncing}>
        {syncing ? "Syncing..." : "Sync subscriptions from YouTube"}
      </button>

      {loading && <p>Loading feed...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p>No saved subscriptions yet. Try syncing first!</p>
      )}

      <ul>
        {items.map((item) => (
          <li key={item.channel_id}>
            <b>{item.channel_title}</b>
            <br />
            <p>{item.channel_id}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
