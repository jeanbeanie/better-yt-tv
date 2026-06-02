import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSubscriptions } from "../lib/api";

type SubscriptionItem = {
  channelId: string;
  title: string;
  thumbnails?: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
  };
};

export default function AllPage() {
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSubscriptions() {
    try {
      setLoading(true);
      setError(null);
      const data = await getSubscriptions();
      setItems(data.items ?? []);
      console.log('items', data.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions");
      console.log('err', err)
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubscriptions();
  }, []);

  return (
    <main>
      <nav style={{ marginBottom: "1rem" }}>
        <Link to="/">← Back home</Link>
      </nav>

      <h1>All Subscriptions</h1>
      <p>This is the /all page placeholder texterooo.</p>

      {loading && <p>Loading subscriptions...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p>No subscriptions found.</p>
      )}

      <ul style={{ listStyle: "none"}}>
        {items.map((item) => (
          <li
            key={item.channelId}
            style={{
              display: "flex",
              alignItems: "center", // vertically center thumbnail
              gap: "1rem", // space between img and div
              marginBottom: "1rem",
            }}
          >
            {item.thumbnails?.default?.url && (
              <img
                src={item.thumbnails.default.url}
                alt={item.title}
                width={48}
                height={48}
              />
            )}
            <div>
              <div>{item.title}</div>
              <p>channel id: {item.channelId}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
