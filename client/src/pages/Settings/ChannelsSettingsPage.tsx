import { useEffect, useState } from "react";
import { getChannels, updateChannel } from "../../lib/api";


type ChannelItem = {
  channelId: string;
  title: string;
  thumbUrl: string | null;
  enabledAll: boolean;
  enabledLive: boolean;
  excludedShorts: boolean;
};

// an object where the key:strings, and value is boolean
type SavingMap = Record<string, boolean>;

export default function ChannelsSettingsPage() {
  // full set of channels loaded from backend
  const [channels, setChannels] = useState<ChannelItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // track which individual channel row is saving for ui disabling
  const [savingByChannelId, setSavingByChannelId] = useState<SavingMap>({});

  async function loadChannels() {
    try {
      setLoading(true);
      setError(null);

      const data = await getChannels();
      setChannels(data.channels ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load channel settings",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadChannels();
  }, []);

  async function handleToggle(
    channelId: string,
    updates: {
      enabledAll?: boolean;
      enabledLive?: boolean;
      excludedShorts?: boolean;
    },
  ) {
    // Save the previous state so we can revert if the backend request fails
    const previousChannels = channels;

    // then optimistically update the UI immediately => flow feels uninterrupted when updating
    setChannels((currentChannels) =>
      currentChannels.map((channel) =>
        // target passed in channelId and apply passed in updates                 
        channel.channelId === channelId
          ? { ...channel, ...updates }
          : channel,
      ),
    );

    // Mark this specific row as currently "saving"
    setSavingByChannelId((current) => ({
      ...current,
      [channelId]: true,
    }));

    try {
      setError(null);

      // Persist the changed field(s) to the server
      await updateChannel(channelId, updates);
    } catch (err) {
      // If the save fails, restore previous UI state
      setChannels(previousChannels);

      setError(
        err instanceof Error ? err.message : "Failed to save channel settings",
      );
    } finally {
      // Clear the row's currently saving state for both success/failure
      setSavingByChannelId((current) => ({
        ...current,
        [channelId]: false,
      }));
    }

  }

  return(
<div style={{ display: "grid", gap: "1rem" }}>
      <header>
        <h2 style={{ marginBottom: "0.5rem" }}>Channel settings</h2>
        <p style={{ margin: 0, color: "#666" }}>
          Choose which channels participate in your queue and how their uploads behave.
        </p>
      </header>

      {loading && <p>Loading channels...</p>}

      {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}

      {!loading && !error && channels.length === 0 && (
        <p>No synced channels yet. Sync subscriptions first.</p>
      )}

      {!loading && channels.length > 0 && (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {channels.map((channel) => {
            const isSaving = savingByChannelId[channel.channelId] === true;

            return (
              <article
                key={channel.channelId}
                style={{
                  border: "1px solid #333",
                  borderRadius: "12px",
                  padding: "1rem",
                  display: "flex",
                  gap: "1rem",
                }}
              >
                {/* Channel identity */}
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                    width: "20rem"
                  }}
                >
                  {channel.thumbUrl ? (
                    <img
                      src={channel.thumbUrl}
                      alt=""
                      width={48}
                      height={48}
                      style={{
                        borderRadius: "999px",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "999px",
                        background: "#111",
                      }}
                    />
                  )}

                  <div>
                    <h3 style={{ margin: 0 }}>{channel.title}</h3>
                    <p style={{ margin: 0, color: "#666", fontSize: "smaller" }}>
                      {channel.channelId}
                    </p>
                  </div>
                </div>

                {/* Channel preference toggles */}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={channel.enabledAll}
                      disabled={isSaving}
                      onChange={(event) =>
                        void handleToggle(channel.channelId, {
                          enabledAll: event.target.checked,
                        })
                      }
                    />
                    Enable this channel in All
                  </label>

                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={channel.enabledLive}
                      disabled={isSaving}
                      onChange={(event) =>
                        void handleToggle(channel.channelId, {
                          enabledLive: event.target.checked,
                        })
                      }
                    />
                    Enable this channel in Live
                  </label>

                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={channel.excludedShorts}
                      disabled={isSaving}
                      onChange={(event) =>
                        void handleToggle(channel.channelId, {
                          excludedShorts: event.target.checked,
                        })
                      }
                    />
                    Exclude Shorts from All
                  </label>
                </div>

              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
