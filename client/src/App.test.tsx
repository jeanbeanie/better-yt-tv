import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "./App";
import { getWhoAmI, hasInviteCode, saveInviteCode } from "./lib/api";

vi.mock("./lib/api", () => ({
  getWhoAmI: vi.fn(),
  getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
  logout: vi.fn(),
  saveInviteCode: vi.fn(),
  hasInviteCode: vi.fn(() => true),
}));

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
}

describe("theme toggle", () => {
  beforeEach(() => {
    vi.mocked(getWhoAmI).mockReset();
    vi.mocked(getWhoAmI).mockResolvedValue({ user: null });
    document.documentElement.removeAttribute("data-theme");
  });

  it("respects a previously saved theme preference on mount", async () => {
    window.localStorage.setItem("betterYtTv.theme", "dark");

    renderApp();

    expect(
      await screen.findByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggles the theme, updates the DOM attribute, and persists to localStorage", async () => {
    window.localStorage.setItem("betterYtTv.theme", "light");
    const user = userEvent.setup();

    renderApp();

    const toggle = await screen.findByRole("button", { name: "Switch to dark mode" });
    await user.click(toggle);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("betterYtTv.theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });
});

describe("invite code from the URL", () => {
  beforeEach(() => {
    vi.mocked(getWhoAmI).mockReset();
    vi.mocked(getWhoAmI).mockResolvedValue({ user: null });
    vi.mocked(saveInviteCode).mockClear();
    window.history.pushState({}, "", "/");
    // avoids getInitialTheme falling through to the unpolyfilled
    // window.matchMedia, same as the theme toggle tests above
    window.localStorage.setItem("betterYtTv.theme", "light");
  });

  it("saves an invite code found in the URL on mount", async () => {
    window.history.pushState({}, "", "/?invite=code-1");

    renderApp();

    await screen.findByRole("link", { name: "Home" });
    expect(saveInviteCode).toHaveBeenCalledWith("code-1");
  });

  it("doesn't call saveInviteCode when there's no invite param", async () => {
    renderApp();

    await screen.findByRole("link", { name: "Home" });
    expect(saveInviteCode).not.toHaveBeenCalled();
  });
});

describe("nav Login link", () => {
  beforeEach(() => {
    vi.mocked(getWhoAmI).mockReset();
    vi.mocked(getWhoAmI).mockResolvedValue({ user: null });
    vi.mocked(hasInviteCode).mockReset();
    window.history.pushState({}, "", "/");
    window.localStorage.setItem("betterYtTv.theme", "light");
  });

  it("shows Login in the nav when a code is available", async () => {
    vi.mocked(hasInviteCode).mockReturnValue(true);

    renderApp();

    await screen.findByRole("link", { name: "Home" });
    // HomePage renders its own Login button too, so scope to the nav
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Login" })).toBeInTheDocument();
  });

  it("hides Login from the nav when no code is available", async () => {
    vi.mocked(hasInviteCode).mockReturnValue(false);

    renderApp();

    await screen.findByRole("link", { name: "Home" });
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
  });
});

describe("footer links", () => {
  beforeEach(() => {
    vi.mocked(getWhoAmI).mockReset();
    vi.mocked(getWhoAmI).mockResolvedValue({ user: null });
    window.history.pushState({}, "", "/");
    window.localStorage.setItem("betterYtTv.theme", "light");
  });

  it("links to /privacy and /terms, reachable while logged out", async () => {
    renderApp();

    await screen.findByRole("link", { name: "Home" });

    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});

describe("demo nav and footer", () => {
  const demoUser = { id: "1", email: "user@example.com", google_sub: "sub-1", is_admin: false };

  beforeEach(() => {
    vi.mocked(getWhoAmI).mockReset();
    vi.mocked(getWhoAmI).mockResolvedValue({ user: demoUser });
    vi.mocked(hasInviteCode).mockReset();
    vi.mocked(hasInviteCode).mockReturnValue(true);
    window.localStorage.setItem("betterYtTv.theme", "light");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("hides Streams and Logout and shows Exit demo at /demo", async () => {
    window.history.pushState({}, "", "/demo");

    renderApp();

    const exit = await screen.findByRole("link", { name: "Exit demo" });
    expect(exit).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "Streams" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
  });

  it("hides the nav Login link at /demo with no user", async () => {
    vi.mocked(getWhoAmI).mockResolvedValue({ user: null });
    window.history.pushState({}, "", "/demo");

    renderApp();

    // HomePage demo link marks the end of loading
    await screen.findByRole("link", { name: "Go to /all videos" });
    const nav = screen.getByRole("navigation");
    expect(within(nav).queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
  });

  it("keeps Streams and Logout and omits Exit demo outside demo", async () => {
    window.history.pushState({}, "", "/");

    renderApp();

    await screen.findByRole("button", { name: "Logout" });
    expect(screen.getByRole("link", { name: "Streams" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Exit demo" })).not.toBeInTheDocument();
  });
});
