import { useEffect, useState, useMemo, useRef } from "react";
import {
  getChannels,
  updateChannel,
  bulkUpdateChannels,
  refreshAllCache,
  syncSubscriptions
} from "../../lib/api";
import ErrorText from "../../components/ErrorText";
import MutedText from "../../components/MutedText";
import Button from "../../components/Button";
import CheckboxLabel from "../../components/CheckboxLabel";
import Thumbnail from "../../components/Thumbnail";


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

type BulkPreferenceState = {
  checked: boolean;
  indeterminate: boolean;
}

type RefreshResult = {
  ok: boolean;
  refreshedChannels: number;
  skippedChannels?: number;
  cachedVideos: number;
};

type SyncResult = {
  ok: boolean;
  syncedCount: number;
};

const PAGE_SIZE = 30;

export default function ChannelsSettingsPage() {
  // full set of channels loaded from backend
  const [channels, setChannels] = useState<ChannelItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // search + how many of the (possibly filtered) channels are currently rendered
  const [searchText, setSearchText] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  function handleSearchChange(value: string) {
    setSearchText(value);
    // start a fresh search at the first page, rather than wherever
    // "Load more" had gotten to before typing
    setVisibleCount(PAGE_SIZE);
  }

  const filteredChannels = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return channels;
    return channels.filter((channel) => channel.title.toLowerCase().includes(query));
  }, [channels, searchText]);

  const visibleChannels = filteredChannels.slice(0, visibleCount);

  // Refresh feed
  const [refreshing, setRefreshing] = useState(false);
  // Holds the latest successful refresh summary so we can show feedback to the user
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);

  // Sync subscriptions
  const [syncing, setSyncing] = useState(false);
  // Holds the latest successful sync summary so we can show feedback to the user
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // track which individual channel row is saving for UI disabling
  const [savingByChannelId, setSavingByChannelId] = useState<SavingMap>({});
  
  // BULK SETTINGS
  const [bulkSaving, setBulkSaving] = useState(false);
  
  // Derive the aggregate state for each bulk checkbox from the loaded channel rows
  const bulkAllState = useMemo(
    () => getBulkPreferenceState(channels, (channel) => channel.enabledAll),
    [channels],
  );

  const bulkLiveState = useMemo(
    () => getBulkPreferenceState(channels, (channel) => channel.enabledLive),
    [channels],
  );

  const bulkShortsState = useMemo(
    () => getBulkPreferenceState(channels, (channel) => channel.excludedShorts),
    [channels],
  );

  // indeterminate is a dom property (rather than react prop)
  // so we need to manually set the real checkbox element
  const allCheckboxRef = useRef<HTMLInputElement | null>(null);
  const liveCheckboxRef = useRef<HTMLInputElement | null>(null);
  const shortsCheckboxRef = useRef<HTMLInputElement | null>(null);


  // Derive the visual state of a bulk checkbox from all channel row values
  // - checked = every row is true
  // - unchecked = every row is false
  // - indeterminate = mixed true/false values
  function getBulkPreferenceState(
    channels: ChannelItem[],
    getValue: (channel: ChannelItem) => boolean,
  ): BulkPreferenceState {
    if (channels.length === 0) {
      return {
        checked: false,
        indeterminate: false,
      };
    }

    const allTrue = channels.every((channel) => getValue(channel) === true);
    const allFalse = channels.every((channel) => getValue(channel) === false);

    return {
      checked: allTrue,
      indeterminate: !allTrue && !allFalse,
    };
  }

  // Sync the DOM-only indeterminate property for each bulk checkbox
  // React controls checked, but indeterminate must still be set imperatively
  useEffect(() => {
    if (allCheckboxRef.current) {
      allCheckboxRef.current.indeterminate = bulkAllState.indeterminate;
    }

    if (liveCheckboxRef.current) {
      liveCheckboxRef.current.indeterminate = bulkLiveState.indeterminate;
    }

    if (shortsCheckboxRef.current) {
      shortsCheckboxRef.current.indeterminate = bulkShortsState.indeterminate;
    }
  }, [
    bulkAllState.indeterminate,
    bulkLiveState.indeterminate,
    bulkShortsState.indeterminate,
  ]);

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


  // HANDLER FUNCTIONS

  async function handleRefreshFeed() {
    try {
      setRefreshing(true);
      setError(null);

      // Clear the previous result so the user only sees the newest refresh summary
      setRefreshResult(null);

      // Call the API helper that refreshes cached uploads/feed data
      const result = await refreshAllCache();

      setRefreshResult(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh feed",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSyncSubscriptions() {
    try {
      setSyncing(true);
      setError(null);

      // Clear the previous result so the user only sees the newest sync summary
      setSyncResult(null);

      // Call the API helper that imports/updates the user's YouTube subscriptions
      const result = await syncSubscriptions();

      setSyncResult(result);

      // Pick up any newly-synced channels in the visible list
      await loadChannels();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sync subscriptions",
      );
    } finally {
      setSyncing(false);
    }
  }


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

  async function handleBulkToggle(updates: {
    enabledAll?: boolean;
    enabledLive?: boolean;
    excludedShorts?: boolean;
  }) {
    // Save full prev state in case we need to roll back after a failed request
    const previousChannels = channels;

    const channelIds = channels.map((channel) => channel.channelId);

    if (channelIds.length === 0) {
      return;
    }

    // apply the new value to every loaded channel row
    setChannels((currentChannels) =>
      currentChannels.map((channel) => ({
        ...channel,
        ...updates,
      })),
    );

    setBulkSaving(true);

    try {
      setError(null);

      await bulkUpdateChannels({
        channelIds,
        ...updates,
      });
    } catch (err) {
      // Restore previous state if the bulk update fails
      setChannels(previousChannels);

      setError(
        err instanceof Error ? err.message : "Failed to save bulk channel settings",
      );
    } finally {
      setBulkSaving(false);
    }
  }

  // check state, if any individual row is saving, disable bulk toggles to avoid overlapping mutations
  const anyRowSaving = Object.values(savingByChannelId).some(Boolean);

  return(
    <div style={{ display: "grid", gap: "1rem" }}>
      <header>
        <h2 style={{ marginBottom: "0.5rem" }}>Channel settings</h2>
        <MutedText>
          Choose which channels participate in your queue and how their uploads behave.
        </MutedText>
      </header>

      {loading && <p>Loading channels...</p>}

      {error && <ErrorText>{error}</ErrorText>}

    <section
      style={{
        display: "grid",
        gap: "0.75rem",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "1rem",
      }}
    >
      <div style={{ display:"flex", gap:"1rem"}}>
        YouTube Actions:
        <div style={{ display: "flex", flex: 1, gap: "1rem", justifyContent: "center" }}>
          <Button
            type="button"
            title="Manually refresh cached uploads for your subscribed channels."
            disabled={refreshing || syncing || bulkSaving || anyRowSaving}
            onClick={() => void handleRefreshFeed()}
          >
            {refreshing ? "Refreshing..." : "Refresh feed"}
          </Button>

          <Button
            type="button"
            title="Import/update your subscriptions from YouTube."
            disabled={syncing || refreshing || bulkSaving || anyRowSaving}
            onClick={() => void handleSyncSubscriptions()}
          >
            {syncing ? "Syncing..." : "Sync subscriptions"}
          </Button>
        </div>
      </div>


      {refreshResult && (
        <MutedText>
          Refreshed {refreshResult.refreshedChannels} channel
          {refreshResult.refreshedChannels === 1 ? "" : "s"}
          {typeof refreshResult.skippedChannels === "number"
            ? `, skipped ${refreshResult.skippedChannels}`
            : ""}
          , cached {refreshResult.cachedVideos} video
          {refreshResult.cachedVideos === 1 ? "" : "s"}.
        </MutedText>
      )}

      {syncResult && (
        <MutedText>
          Synced {syncResult.syncedCount} channel
          {syncResult.syncedCount === 1 ? "" : "s"}.
        </MutedText>
      )}
    </section>


      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
          padding: "0.75rem 1rem",
          border: "1px solid #333",
          borderRadius: "12px",
        }}
      >
        Bulk Channel Settings (Affects ALL Channels!): 
        <CheckboxLabel
          ref={allCheckboxRef}
          checked={bulkAllState.checked}
          disabled={bulkSaving || anyRowSaving || syncing || loading || channels.length === 0}
          onChange={(event) =>
            void handleBulkToggle({ enabledAll: event.target.checked })
          }
        >
          Include in All
        </CheckboxLabel>

        <CheckboxLabel
          ref={liveCheckboxRef}
          checked={bulkLiveState.checked}
          disabled={bulkSaving || anyRowSaving || syncing || loading || channels.length === 0}
          onChange={(event) =>
            void handleBulkToggle({ enabledLive: event.target.checked })
          }
        >
          Include in Live
        </CheckboxLabel>

        <CheckboxLabel
          ref={shortsCheckboxRef}
          checked={bulkShortsState.checked}
          disabled={bulkSaving || anyRowSaving || syncing || loading || channels.length === 0}
          onChange={(event) =>
            void handleBulkToggle({ excludedShorts: event.target.checked })
          }
        >
          Exclude Shorts
        </CheckboxLabel>
      </div>

      {!loading && !error && channels.length === 0 && (
        <p>No synced channels yet. Sync subscriptions first.</p>
      )}

      {!loading && channels.length > 0 && (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <input
            type="text"
            value={searchText}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search your channels"
          />
          <MutedText style={{ fontSize: "smaller" }}>
            Showing {visibleChannels.length} of {filteredChannels.length}
            {searchText.trim() ? " matching channels" : " channels"}
          </MutedText>
        </div>
      )}

      {!loading && channels.length > 0 && filteredChannels.length === 0 && (
        <p>No channels match your search.</p>
      )}

      {!loading && filteredChannels.length > 0 && (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {visibleChannels.map((channel) => {
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
                  <Thumbnail
                    src={channel.thumbUrl}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    style={{
                      borderRadius: "999px",
                      objectFit: "cover",
                    }}
                    fallback={
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: "999px",
                          background: "var(--border)",
                        }}
                      />
                    }
                  />

                  <div>
                    <h3 style={{ margin: 0 }}>{channel.title}</h3>
                    <MutedText style={{ fontSize: "smaller" }}>
                      {channel.channelId}
                    </MutedText>
                  </div>
                </div>

                {/* Channel preference toggles */}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <CheckboxLabel
                    checked={channel.enabledAll}
                    disabled={isSaving || bulkSaving || syncing}
                    onChange={(event) =>
                      void handleToggle(channel.channelId, {
                        enabledAll: event.target.checked,
                      })
                    }
                  >
                    Enable in All
                  </CheckboxLabel>

                  <CheckboxLabel
                    checked={channel.enabledLive}
                    disabled={isSaving || bulkSaving || syncing}
                    onChange={(event) =>
                      void handleToggle(channel.channelId, {
                        enabledLive: event.target.checked,
                      })
                    }
                  >
                    Enable in Live
                  </CheckboxLabel>

                  <CheckboxLabel
                    checked={channel.excludedShorts}
                    disabled={isSaving || bulkSaving || syncing}
                    onChange={(event) =>
                      void handleToggle(channel.channelId, {
                        excludedShorts: event.target.checked,
                      })
                    }
                  >
                    Exclude Shorts from All
                  </CheckboxLabel>
                </div>

              </article>
            );
          })}

          {visibleCount < filteredChannels.length && (
            <Button
              type="button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              style={{ justifySelf: "center" }}
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
