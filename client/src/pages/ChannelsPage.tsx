import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChannels, updateChannel } from "../lib/api";

type ChannelItem = {
  channelId: string;
  title: string;
  thumbUrl: string | null;
  enabledAll: boolean;
  enabledLive: boolean;
  excludedShorts: boolean;
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadChannels() {
    try {
      setLoading(true);
      setError(null);

      const data = await getChannels();
      setChannels(data.channels ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load channels")
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadChannels();
  }, []);

  return(
    <main>
      <nav style={{ marginBottom: "1rem" }}>
        <Link to="/">← Back home</Link>
      </nav>
      
      <h1>Channels</h1>
      
      {loading && <p>Loading channels...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {!loading && !error && channels.length === 0 && (
        <p>No synced channels yet. Sync subscriptions first.</p>
      )}
      
    </main>
  );
}
