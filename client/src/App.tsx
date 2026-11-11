import { useEffect, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { getLoginUrl, getWhoAmI, hasInviteCode, logout, saveInviteCode, type User } from "./lib/api";
import { isNavigationAllowed } from "./lib/navigationGuard";
import Button from "./components/Button";
import GuardedLink from "./components/GuardedLink";
import HomePage from "./pages/HomePage";
import AllPage from "./pages/AllPage";
import LivePage from "./pages/LivePage";
import ListsPage from "./pages/ListsPage";
import SettingsLayout from "./pages/Settings/SettingsLayout";
import ChannelsSettingsPage from "./pages/Settings/ChannelsSettingsPage";
import ListsSettingsPage from "./pages/Settings/ListsSettingsPage";
import ListEditorPage from "./pages/Settings/ListEditorPage";
import AdvancedSettingsPage from "./pages/Settings/AdvancedSettingsPage";
import ChangelogPage from "./pages/ChangelogPage";
import AdminPage from "./pages/AdminPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";

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
    if (!isNavigationAllowed()) return;

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

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) saveInviteCode(invite);
  }, []);


  return (
    <div className="layout">
      <header style={{ marginBottom: "2rem" }}>
        <nav style={{ display: "flex", gap: "1rem" }}>
          
          <GuardedLink to="/">Home</GuardedLink>
          {!loading && !user && hasInviteCode() &&
            <a href={getLoginUrl()}>Login</a>
          }
          {!loading && user && (
            <>
            <GuardedLink to="/all">All</GuardedLink>
            <GuardedLink to="/lists">Lists</GuardedLink>
            <GuardedLink to="/live">Streams</GuardedLink>
            <GuardedLink to="/settings">Settings</GuardedLink>
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
        <Route path="/privacy" element={<PrivacyPage />}/>
        <Route path="/terms" element={<TermsPage />}/>
        <Route path="/admin" element={<AdminPage />}/>
        {/*  SETTINGS ROUTES */}
        <Route path="/settings" element={<SettingsLayout user={user} />}>
          <Route index element={<ChannelsSettingsPage />} />
          <Route path="channels" element={<ChannelsSettingsPage />} />
          <Route path="lists" element={<ListsSettingsPage />} />
          <Route path="lists/:listId" element={<ListEditorPage />} />
          <Route path="advanced" element={<AdvancedSettingsPage />} />
        </Route>
      </Routes>
      
      <hr style={{ borderColor: "var(--border)", marginTop:"3rem", opacity: ".3"}}/>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "2rem 0"}}>
      {!loading && user && (
        <div>
          <Button onClick={() => void handleLogout()}>Logout</Button>
        </div>
      )}
      <GuardedLink to="/changelog">Changelog</GuardedLink>
      <GuardedLink to="/privacy">Privacy</GuardedLink>
      <GuardedLink to="/terms">Terms</GuardedLink>
      </div>

    </div>
  );
}

export default App;
