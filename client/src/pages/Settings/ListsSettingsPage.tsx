import { useEffect, useState } from "react";
import { getLists, getLoginUrl, shouldRedirectToLogin, type ListSummary } from "../../lib/api";

export default function ListsSettingsPage() {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingLoginRedirect, setPendingLoginRedirect] = useState(false);

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

  return (
    <div>
      <header>
        <p>Create and manage your Lists: custom video queues curated by you.</p>
      </header>

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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
