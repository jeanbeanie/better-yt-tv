import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getLists,
  createList,
  getLoginUrl,
  shouldRedirectToLogin,
  type ListSummary,
} from "../../lib/api";

export default function ListsSettingsPage() {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingLoginRedirect, setPendingLoginRedirect] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  async function loadLists() {
    try {
      setLoading(true);
      setError(null);

      const data = await getLists();
      setLists(data.lists ?? []);
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load lists");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLists();
  }, []);

  async function handleCreateList(event: React.FormEvent) {
    event.preventDefault();

    const trimmedName = newListName.trim();
    if (!trimmedName) return;

    try {
      setCreating(true);
      setCreateError(null);

      await createList(trimmedName);

      setNewListName("");
      // Refresh from server so the new list (and any server-side trimming) is reflected
      await loadLists();
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setCreateError(err instanceof Error ? err.message : "Failed to create list");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <header>
        <p>Create and manage your Lists: custom video queues curated by you.</p>
      </header>

      <form onSubmit={(event) => void handleCreateList(event)} style={{ margin: "1rem 0" }}>
        <input
          type="text"
          value={newListName}
          onChange={(event) => setNewListName(event.target.value)}
          placeholder="New list name"
          disabled={creating}
        />
        <button type="submit" disabled={creating || !newListName.trim()}>
          {creating ? "Creating..." : "Create new list"}
        </button>
        {createError && <p style={{ color: "crimson" }}>{createError}</p>}
      </form>

      {loading && <p>Loading lists...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {!loading && !error && lists.length === 0 && (
        <p>You don&apos;t have any lists yet.</p>
      )}

      {!loading && !error && lists.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {lists.map((list) => (
            <li
              key={list.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 0",
                borderTop: "1px solid #333",
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{list.name}</div>
                <div style={{ fontSize: "0.8rem", color: "#666" }}>
                  {list.channelCount} {list.channelCount === 1 ? "channel" : "channels"}
                </div>
              </div>
              <Link to={`/settings/lists/${list.id}`}>Edit</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
