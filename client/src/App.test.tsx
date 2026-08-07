import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";
import { getWhoAmI } from "./lib/api";

vi.mock("./lib/api", () => ({
  getWhoAmI: vi.fn(),
  getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
  logout: vi.fn(),
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
