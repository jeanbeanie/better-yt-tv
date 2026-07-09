import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { getLoginUrl, getWhoAmI, logout } from "./lib/api";
import HomePage from "./pages/HomePage";
import AllPage from "./pages/AllPage";

type User = {
  id: string;
  email: string | null;
  google_sub: string;
};

function App() {

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
      console.log('IN APP', 'user:', user, loading, error)
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
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <header style={{ marginBottom: "2rem" }}>
        <nav style={{ display: "flex", gap: "1rem" }}>
          
          <Link to="/">Home</Link>
          {!loading && !user && 
            <a href={getLoginUrl()}>Login</a>
          }
          {!loading && user && (
            <>
            <Link to="/all">All</Link>
            <Link to="/">Live</Link>
            <Link to="/">Channel</Link>
            <Link to="/">Lists</Link>
            <Link to="/">Settings</Link>
            </>
          )}
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<HomePage user={user} loading={loading} error={error} />} />
        <Route path="/all" element={<AllPage />} />
      </Routes>
      

      {!loading && user && (
        <div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button onClick={() => void handleLogout()}>Logout</button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
