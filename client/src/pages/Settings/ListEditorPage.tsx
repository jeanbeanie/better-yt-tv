import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getList,
  getChannels,
  getLoginUrl,
  shouldRedirectToLogin,
  ApiError,
  type ListChannel,
} from "../../lib/api";

const SEARCH_RESULT_LIMIT = 25;

export default function ListEditorPage() {
  const { listId } = useParams<{ listId: string }>();

  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [pendingLoginRedirect, setPendingLoginRedirect] = useState(false);
  const [allChannels, setAllChannels] = useState<ListChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<ListChannel[]>([]);
  const [searchText, setSearchText] = useState("");

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

  async function loadList() {
    if (!listId) return;

    try {
      setListLoading(true);
      setError(null);
      setNotFound(false);

      const data = await getList(listId);
      setName(data.list.name);
      setSelectedChannels(data.list.channels);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
        return;
      }
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load list");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, [listId]);

  useEffect(() => {
    // If this fails, just leave allChannels empty -- name editing (and the
    // rest of the page) should still work, per spec.
    getChannels()
      .then((data) => setAllChannels(data.channels))
      .catch(() => {});
  }, []);

  const searchResults = useMemo(() => {
    const selectedIds = new Set(selectedChannels.map((c) => c.channelId));
    const query = searchText.trim().toLowerCase();

    return allChannels
      .filter((c) => !selectedIds.has(c.channelId))
      .filter((c) => !query || c.title.toLowerCase().includes(query))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allChannels, selectedChannels, searchText]);

  const visibleSearchResults = searchResults.slice(0, SEARCH_RESULT_LIMIT);

  function addChannel(channel: ListChannel) {
    setSelectedChannels((prev) => [...prev, channel]);
  }

  function removeChannel(channelId: string) {
    setSelectedChannels((prev) => prev.filter((c) => c.channelId !== channelId));
  }

  return (
    <div>
      <p>
        <Link to="/settings/lists">&larr; Back to Lists</Link>
      </p>

      {listLoading && <p>Loading list...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {notFound && <p>List not found.</p>}

      {!listLoading && !error && !notFound && (
        <>
          <h1>{name}</h1>

          <section style={{ margin: "1rem 0" }}>
            <h2>Channels in this list</h2>
            {selectedChannels.length === 0 && <p>No channels selected yet.</p>}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {selectedChannels.map((channel) => (
                <li
                  key={channel.channelId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.5rem 0",
                    borderTop: "1px solid #333",
                  }}
                >
                  {channel.thumbUrl && (
                    <img
                      src={channel.thumbUrl}
                      alt={channel.title}
                      width={40}
                      loading="lazy"
                      style={{ borderRadius: "50%" }}
                    />
                  )}
                  <span style={{ flex: 1 }}>{channel.title}</span>
                  <button onClick={() => removeChannel(channel.channelId)}>Remove</button>
                </li>
              ))}
            </ul>
          </section>

          <section style={{ margin: "1rem 0" }}>
            <h2>Add channels</h2>
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search your subscribed channels"
            />
            {searchResults.length > SEARCH_RESULT_LIMIT && (
              <p style={{ margin: "0.5rem 0 0", color: "#666", fontSize: "smaller" }}>
                Showing {SEARCH_RESULT_LIMIT} of {searchResults.length} matches -- refine your
                search to narrow results
              </p>
            )}
            <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0" }}>
              {visibleSearchResults.map((channel) => (
                <li
                  key={channel.channelId}
                  onClick={() => addChannel(channel)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.75rem",
                    padding: "0.5rem 0",
                    borderTop: "1px solid #333",
                    cursor: "pointer",
                  }}
                >
                  {channel.thumbUrl && (
                    <img
                      src={channel.thumbUrl}
                      alt={channel.title}
                      width={32}
                      loading="lazy"
                      style={{ borderRadius: "50%" }}
                    />
                  )}
                  <span>{channel.title}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
