import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AppRoot from "../../AppRoot";
import { getRouterBasename, isDemoMode } from "./mode";

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  async () => new Response("{}", { status: 200 }),
);

function renderShell() {
  return render(
    <BrowserRouter basename={getRouterBasename()}>
      <AppRoot />
    </BrowserRouter>,
  );
}

describe("demo shell", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    window.localStorage.setItem("betterYtTv.theme", "light");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("builds demo nav and footer links under /demo with no network calls", async () => {
    window.history.pushState({}, "", "/demo/all");

    renderShell();

    // Exit demo renders once whoami resolves, so the nav is settled
    await screen.findByRole("link", { name: "Exit demo" });
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "All" })).toHaveAttribute("href", "/demo/all");
    expect(within(nav).getByRole("link", { name: "Lists" })).toHaveAttribute("href", "/demo/lists");
    expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/demo/settings",
    );
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/demo");
    expect(within(nav).queryByRole("link", { name: "Streams" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exit demo" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();

    // fail closed feed 404 surfaces as error text on the All page
    await screen.findByText("Not found");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("keeps in app navigation under /demo when clicking Lists", async () => {
    window.history.pushState({}, "", "/demo/all");
    const user = userEvent.setup();

    renderShell();

    await user.click(await screen.findByRole("link", { name: "Lists" }));

    await waitFor(() => expect(window.location.pathname).toBe("/demo/lists"));
    expect(isDemoMode()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("renders the demo home at /demo with no network calls", async () => {
    window.history.pushState({}, "", "/demo");
    window.localStorage.setItem("betterYtTv.inviteCode", "code-1");

    renderShell();

    const demoLink = await screen.findByRole("link", { name: "Go to /all videos" });
    expect(demoLink).toHaveAttribute("href", "/demo/all");
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByText(/requires an invite/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/logged in as/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("calls the real fetch for whoami outside demo", async () => {
    window.history.pushState({}, "", "/");
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ user: null }), { status: 200 }),
    );

    renderShell();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/auth/whoami");
  });

  it("shows only Channels and Lists in the demo settings nav", async () => {
    window.history.pushState({}, "", "/demo/settings/channels");

    renderShell();

    const settingsNav = await screen.findByRole("link", { name: "Channels" }).then(
      () => screen.getAllByRole("navigation").find((nav) => within(nav).queryByRole("link", { name: "Channels" })),
    );
    if (!settingsNav) throw new Error("settings nav not found");
    expect(within(settingsNav).getByRole("link", { name: "Channels" })).toHaveAttribute(
      "href",
      "/demo/settings/channels",
    );
    expect(within(settingsNav).getByRole("link", { name: "Lists" })).toHaveAttribute(
      "href",
      "/demo/settings/lists",
    );
    expect(within(settingsNav).queryByRole("link", { name: "Advanced" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("has no advanced settings route in demo", async () => {
    window.history.pushState({}, "", "/demo/settings/advanced");

    renderShell();

    await screen.findByRole("link", { name: "Exit demo" });
    expect(screen.queryByRole("button", { name: "Delete my account and data" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Advanced" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it.each(["/demo", "/demo/all", "/demo/lists", "/demo/settings/channels"])(
    "renders the demo banner with contact links at %s",
    async (path) => {
      window.history.pushState({}, "", path);

      renderShell();

      await screen.findByRole("link", { name: "Exit demo" });
      expect(screen.getByText(/You're viewing a demo with sample data\. Want an invite\?/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
        "href",
        "https://github.com/jeanbeanie",
      );
      expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
        "href",
        "https://www.linkedin.com/in/jeane-ramos-83339399/",
      );
      expect(fetchMock).toHaveBeenCalledTimes(0);
    },
  );

  it.each(["/demo/live", "/demo/admin"])("renders no Live or Admin page at %s", async (path) => {
    window.history.pushState({}, "", path);

    renderShell();

    await screen.findByRole("link", { name: "Exit demo" });
    expect(screen.queryByRole("heading", { name: "Live Streams" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("toggles the theme from the demo nav and persists it to the shared key", async () => {
    window.history.pushState({}, "", "/demo/all");
    const user = userEvent.setup();

    renderShell();

    await user.click(await screen.findByRole("button", { name: "Switch to dark mode" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("betterYtTv.theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });
});
