import { screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

const originalFetch = globalThis.fetch;

// main.tsx renders at import time, so each test reloads the module against a fresh root
async function mountMain(path: string) {
  window.history.pushState({}, "", path);
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  // avoids getInitialTheme falling through to the unpolyfilled
  // window.matchMedia, same as App.test.tsx
  window.localStorage.setItem("betterYtTv.theme", "light");
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ user: null }), { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.resetModules();
  // dynamic so each reset module graph re-runs main.tsx side effects
  await import("./main");
  return fetchMock;
}

describe("main entry", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.history.pushState({}, "", "/");
  });

  // cold import of the demo feed graph can exceed the default 5s
  it("mounts the demo shell under the /demo basename with no network calls", { timeout: 15_000 }, async () => {
    const fetchMock = await mountMain("/demo/all");

    await screen.findByRole("link", { name: "Exit demo" });
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "All" })).toHaveAttribute("href", "/demo/all");
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/demo");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("mounts the real app at the root basename outside demo", async () => {
    const fetchMock = await mountMain("/");

    const home = await screen.findByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "Exit demo" })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
