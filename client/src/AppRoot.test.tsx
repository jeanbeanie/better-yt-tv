import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AppRoot from "./AppRoot";

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  async () => new Response(JSON.stringify({ user: null }), { status: 200 }),
);

describe("AppRoot", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    window.localStorage.setItem("betterYtTv.theme", "light");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders the demo shell under /demo", async () => {
    window.history.pushState({}, "", "/demo");

    render(
      <MemoryRouter>
        <AppRoot />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Exit demo" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("renders the real app outside demo", async () => {
    window.history.pushState({}, "", "/");

    render(
      <MemoryRouter>
        <AppRoot />
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Exit demo" })).not.toBeInTheDocument();
  });
});
