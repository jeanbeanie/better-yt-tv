import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getList, getLoginUrl, shouldRedirectToLogin, ApiError } from "../../lib/api";

export default function ListEditorPage() {
  const { listId } = useParams<{ listId: string }>();

  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
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

  async function loadList() {
    if (!listId) return;

    try {
      setListLoading(true);
      setError(null);
      setNotFound(false);

      const data = await getList(listId);
      setName(data.list.name);
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

  return (
    <div>
      <p>
        <Link to="/settings/lists">&larr; Back to Lists</Link>
      </p>

      {listLoading && <p>Loading list...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {notFound && <p>List not found.</p>}

      {!listLoading && !error && !notFound && <h1>{name}</h1>}
    </div>
  );
}
