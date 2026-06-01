import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLoginUrl, getWhoAmI, logout } from "../lib/api";

type User = {
  id: string;
  email: string | null;
  google_sub: string;
};

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadUser() {
    try {
      setLoading(true);
      setError(null);
      const data = await getWhoAmI();
      setUser(data.user ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      setUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed");
    }
  }

  useEffect(() => {
    void loadUser();
  }, []);

  return (
    <main>
      <h1>Better YT TV</h1>
      <p>A better way to browse your YouTube subscriptions.</p>

      {loading && <p>Loading user...</p>}

      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !user && (
        <div>
          <p>You are not logged in.</p>
          <a href={getLoginUrl()}>Login with Google</a>
        </div>
      )}

      {!loading && user && (
        <div>
          <p>Logged in as: <strong>{user.email ?? "No email found"}</strong></p>

          <div style={{ display: "flex", gap: "1rem" }}>
            <Link to="/all">Go to /all</Link>
            <button onClick={() => void handleLogout()}>Logout</button>
          </div>
        </div>
      )}
    </main>
  );
}
