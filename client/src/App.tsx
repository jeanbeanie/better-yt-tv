import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { getLoginUrl, getWhoAmI, logout, type User } from "./lib/api";
import Button from "./components/Button";
import HomePage from "./pages/HomePage";
import AllPage from "./pages/AllPage";
import LivePage from "./pages/LivePage";
import ListsPage from "./pages/ListsPage";
import SettingsLayout from "./pages/Settings/SettingsLayout";
import ChannelsSettingsPage from "./pages/Settings/ChannelsSettingsPage";
import ListsSettingsPage from "./pages/Settings/ListsSettingsPage";
import ListEditorPage from "./pages/Settings/ListEditorPage";
import ChangelogPage from "./pages/ChangelogPage";
import AdminPage from "./pages/AdminPage";

function getInitialTheme(): "light" | "dark" {
  const stored = window.localStorage.getItem("betterYtTv.theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function App() {

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("betterYtTv.theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  async function loadUser() {
    try {
      setLoading(true);
      setError(null);
      const data = await getWhoAmI();
      setUser(data.user ?? null);
    } catch (err) {
      console.error("Failed to load user:", err);
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
    } finally {
      navigate("/");
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
            <Link to="/live">Streams</Link>
            <Link to="/lists">Lists</Link>
            <Link to="/settings">Settings</Link>
            </>
          )}
          <button
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "🌙" : "☀️"}
          </button>
        </nav>
      </header>

      <Routes>
        {/* TOP LEVEL ROUTES */}
        <Route path="/" element={<HomePage user={user} loading={loading} error={error} />} />
        <Route path="/all" element={<AllPage />} />
        <Route path="/live" element={<LivePage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/changelog" element={<ChangelogPage />}/>
        <Route path="/admin" element={<AdminPage />}/>
        {/*  SETTINGS ROUTES */}
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<ChannelsSettingsPage />} />
          <Route path="channels" element={<ChannelsSettingsPage />} />
          <Route path="lists" element={<ListsSettingsPage />} />
          <Route path="lists/:listId" element={<ListEditorPage />} />
        </Route>
      </Routes>
      
      <hr style={{ borderColor: "var(--border)", marginTop:"3rem", opacity: ".3"}}/>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "2rem 0"}}>
      {!loading && user && (
        <div>
          <Button onClick={() => void handleLogout()}>Logout</Button>
        </div>
      )}
      <Link to="/changelog">Changelog</Link>
      </div>

    </div>
  );
}

export default App;
