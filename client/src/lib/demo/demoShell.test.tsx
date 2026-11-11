import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "../../App";
import { getRouterBasename, isDemoMode } from "./mode";

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  async () => new Response("{}", { status: 200 }),
);

function renderShell() {
  return render(
    <BrowserRouter basename={getRouterBasename()}>
      <App />
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
});
