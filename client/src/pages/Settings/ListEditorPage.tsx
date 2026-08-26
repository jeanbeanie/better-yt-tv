import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getList,
  getChannels,
  saveList,
  deleteList,
  redirectToLoginOrHome,
  shouldRedirectToLogin,
  refreshAllCache,
  ApiError,
  type ListChannel,
} from "../../lib/api";
import { setNavigationGuard, clearNavigationGuard } from "../../lib/navigationGuard";
import ErrorText from "../../components/ErrorText";
import MutedText from "../../components/MutedText";
import Row from "../../components/Row";
import Spinner from "../../components/Spinner";
import Button from "../../components/Button";
import Thumbnail from "../../components/Thumbnail";
import GuardedLink from "../../components/GuardedLink";

const PAGE_SIZE = 25;

export default function ListEditorPage() {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();

  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [pendingLoginRedirect, setPendingLoginRedirect] = useState(false);
  const [allChannels, setAllChannels] = useState<ListChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<ListChannel[]>([]);
  // last name/channels we know are saved on the server, compared against
  // current state below to tell whether there are unsaved edits
  const [savedSnapshot, setSavedSnapshot] = useState<{
    name: string;
    channelIds: string[];
  } | null>(null);
  const [searchText, setSearchText] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  function handleSearchChange(value: string) {
    setSearchText(value);
    // start a fresh search at the first page, rather than wherever
    // "Load more" had gotten to before typing
    setVisibleCount(PAGE_SIZE);
  }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingLoginRedirect) return;
    redirectToLoginOrHome();
  }, [pendingLoginRedirect]);

  function redirectIfAuthError(err: unknown): boolean {
    if (shouldRedirectToLogin(err)) {
      setError("Your session expired. Redirecting to sign in...");
      setPendingLoginRedirect(true);
      return true;
    }
    return false;
  }

  function applyServerList(list: { name: string; channels: ListChannel[] }) {
    setName(list.name);
    setSelectedChannels(list.channels);
    setSavedSnapshot({
      name: list.name,
      channelIds: list.channels.map((c) => c.channelId),
    });
  }

  async function loadList() {
    if (!listId) return;

    try {
      setListLoading(true);
      setError(null);
      setNotFound(false);

      const data = await getList(listId);
      applyServerList(data.list);
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

  const visibleSearchResults = searchResults.slice(0, visibleCount);

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    if (name.trim() !== savedSnapshot.name) return true;

    const currentIds = selectedChannels.map((c) => c.channelId).sort();
    const savedIds = [...savedSnapshot.channelIds].sort();
    if (currentIds.length !== savedIds.length) return true;
    return currentIds.some((id, i) => id !== savedIds[i]);
  }, [name, selectedChannels, savedSnapshot]);

  // isDirty is read through a ref rather than a useEffect dependency, so
  // the registered guard function keeps a stable identity across renders
  // and clearNavigationGuard can match it by reference on unmount
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  });

  useEffect(() => {
    const checkDirty = () => isDirtyRef.current;
    setNavigationGuard(checkDirty);
    return () => clearNavigationGuard(checkDirty);
  }, []);

  function addChannel(channel: ListChannel) {
    setSelectedChannels((prev) => [...prev, channel]);
  }

  function removeChannel(channelId: string) {
    setSelectedChannels((prev) => prev.filter((c) => c.channelId !== channelId));
  }

  // Re-fetch just the list data after a successful save, to reflect
  // server-validated truth (trimmed name, silently-dropped invalid channel
  // ids), without touching the page-level loading/error/notFound state
  // that loadList() controls (that would flash the whole page back to
  // "Loading list..." and hide the "Saved" message on every save).
  async function reconcileAfterSave() {
    if (!listId) return;
    try {
      const data = await getList(listId);
      applyServerList(data.list);
    } catch {
      // best-effort, the save itself already succeeded, so a reconcile
      // failure shouldn't surface as a save error
    }
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName || !listId) return;

    try {
      setSaving(true);
      setSaveError(null);
      setSaveMessage(null);

      await saveList(listId, {
        name: trimmedName,
        channelIds: selectedChannels.map((c) => c.channelId),
      });

      setSaveMessage("Saved");
      await reconcileAfterSave();

      // Force a fresh refresh here rather than relying on the next page's
      // auto-refresh, since the refresh cooldown is shared across pages
      void refreshAllCache({ manual: true }).catch(() => {});
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setSaveError(err instanceof Error ? err.message : "Failed to save list");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!listId) return;
    if (!window.confirm("Delete this list? This can't be undone.")) return;

    try {
      setDeleting(true);
      setDeleteError(null);

      await deleteList(listId);

      navigate("/settings/lists");
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setDeleteError(err instanceof Error ? err.message : "Failed to delete list");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <p>
        <GuardedLink to="/settings/lists">&larr; Back to Lists</GuardedLink>
      </p>

      {listLoading && <Spinner label="Loading list..." />}
      {error && <ErrorText>{error}</ErrorText>}
      {notFound && <p>List not found.</p>}

      {!listLoading && !error && !notFound && (
        <>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="List name"
            className="text-input"
            style={{ fontSize: "1.5rem", fontWeight: 700 }}
          />

          <div style={{ margin: "1rem 0" }}>
            <GuardedLink to={`/lists?listId=${listId}`}>View list</GuardedLink>

            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !name.trim()}
              style={{ marginLeft: "0.75rem" }}
            >
              {saving ? "Saving..." : "Save list"}
            </Button>
            {saveMessage && <span style={{ marginLeft: "0.75rem" }}>{saveMessage}</span>}

            <Button
              type="button"
              variant="danger"
              onClick={() => void handleDelete()}
              disabled={deleting}
              style={{ marginLeft: "0.75rem" }}
            >
              {deleting ? "Deleting..." : "Delete list"}
            </Button>

            {saveError && (
              <ErrorText style={{ margin: "0.5rem 0 0" }}>{saveError}</ErrorText>
            )}
            {deleteError && (
              <ErrorText style={{ margin: "0.5rem 0 0" }}>{deleteError}</ErrorText>
            )}
          </div>

          <section style={{ margin: "1rem 0" }}>
            <h2>Channels in this list</h2>
            {selectedChannels.length === 0 && <p>No channels selected yet.</p>}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {selectedChannels.map((channel) => (
                <Row
                  key={channel.channelId}
                  style={{ gap: "2rem", padding: "0.5rem 0" }}
                >
                  <Thumbnail
                    src={channel.thumbUrl}
                    alt={channel.title}
                    width={40}
                    loading="lazy"
                    style={{ borderRadius: "50%" }}
                    fallback={
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          background: "var(--border)",
                        }}
                      />
                    }
                  />
                  <span style={{ flex: 1 }}>{channel.title}</span>
                  <Button onClick={() => removeChannel(channel.channelId)}>Remove</Button>
                </Row>
              ))}
            </ul>
          </section>

          <section style={{ margin: "1rem 0" }}>
            <h2>Add channels</h2>
            <input
              type="text"
              value={searchText}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search your subscribed channels"
              className="text-input"
              style={{
                width: "24rem",
                maxWidth: "100%",
                fontSize: "1.1rem",
                padding: "0.6rem 0.9rem",
              }}
            />
            {searchResults.length > 0 && (
              <MutedText style={{ margin: "0.5rem 0 0", fontSize: "smaller" }}>
                Showing {visibleSearchResults.length} of {searchResults.length}
                {searchText.trim() ? " matching channels" : " channels"}
              </MutedText>
            )}
            <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0" }}>
              {visibleSearchResults.map((channel) => (
                <Row
                  key={channel.channelId}
                  onClick={() => addChannel(channel)}
                  style={{ gap: "2rem", padding: "0.5rem 0" }}
                >
                  <Thumbnail
                    src={channel.thumbUrl}
                    alt={channel.title}
                    width={32}
                    loading="lazy"
                    style={{ borderRadius: "50%" }}
                    fallback={
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "var(--border)",
                        }}
                      />
                    }
                  />
                  <span style={{ flex: 1 }}>{channel.title}</span>
                </Row>
              ))}
            </ul>
            {visibleCount < searchResults.length && (
              <Button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                style={{ marginTop: "0.5rem" }}
              >
                Load more
              </Button>
            )}
          </section>

          <div style={{ margin: "1rem 0" }}>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !name.trim()}
            >
              {saving ? "Saving..." : "Save list"}
            </Button>
            {saveMessage && <span style={{ marginLeft: "0.75rem" }}>{saveMessage}</span>}
            {saveError && (
              <ErrorText style={{ margin: "0.5rem 0 0" }}>{saveError}</ErrorText>
            )}
          </div>
        </>
      )}
    </div>
  );
}
