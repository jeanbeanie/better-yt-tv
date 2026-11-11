import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import GuardedLink from "./components/GuardedLink";
import DemoBanner from "./components/DemoBanner";
import DemoHomePage from "./pages/DemoHomePage";
import AllPage from "./pages/AllPage";
import ListsPage from "./pages/ListsPage";
import DemoSettingsLayout from "./pages/Settings/DemoSettingsLayout";
import ChannelsSettingsPage from "./pages/Settings/ChannelsSettingsPage";
import ListsSettingsPage from "./pages/Settings/ListsSettingsPage";
import ListEditorPage from "./pages/Settings/ListEditorPage";
import ChangelogPage from "./pages/ChangelogPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";

function getInitialTheme(): "light" | "dark" {
  const stored = window.localStorage.getItem("betterYtTv.theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function DemoApp() {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("betterYtTv.theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return (
    <div className="layout">
      <DemoBanner />
      <header style={{ marginBottom: "2rem" }}>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <GuardedLink to="/">Home</GuardedLink>
          <GuardedLink to="/all">All</GuardedLink>
          <GuardedLink to="/lists">Lists</GuardedLink>
          <GuardedLink to="/settings">Settings</GuardedLink>
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
        <Route path="/" element={<DemoHomePage />} />
        <Route path="/all" element={<AllPage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/settings" element={<DemoSettingsLayout />}>
          <Route index element={<ChannelsSettingsPage />} />
          <Route path="channels" element={<ChannelsSettingsPage />} />
          <Route path="lists" element={<ListsSettingsPage />} />
          <Route path="lists/:listId" element={<ListEditorPage />} />
        </Route>
      </Routes>

      <hr style={{ borderColor: "var(--border)", marginTop:"3rem", opacity: ".3"}}/>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "2rem 0"}}>
        <div>
          <a href="/" className="button">Exit demo</a>
        </div>
        <GuardedLink to="/changelog">Changelog</GuardedLink>
        <GuardedLink to="/privacy">Privacy</GuardedLink>
        <GuardedLink to="/terms">Terms</GuardedLink>
      </div>
    </div>
  );
}
