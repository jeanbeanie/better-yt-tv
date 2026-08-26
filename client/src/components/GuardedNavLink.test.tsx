import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import GuardedNavLink from "./GuardedNavLink";
import { setNavigationGuard, clearNavigationGuard } from "../lib/navigationGuard";

function renderNavLink() {
  return render(
    <MemoryRouter initialEntries={["/from"]}>
      <Routes>
        <Route path="/from" element={<GuardedNavLink to="/to">Go</GuardedNavLink>} />
        <Route path="/to" element={<div>Arrived</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GuardedNavLink", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("navigates normally when there is no unsaved-changes guard", async () => {
    const user = userEvent.setup();
    renderNavLink();

    await user.click(screen.getByRole("link", { name: "Go" }));

    expect(await screen.findByText("Arrived")).toBeInTheDocument();
  });

  it("stays on the page when the user cancels the confirm dialog", async () => {
    const fn = () => true;
    setNavigationGuard(fn);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    renderNavLink();

    await user.click(screen.getByRole("link", { name: "Go" }));

    expect(screen.queryByText("Arrived")).not.toBeInTheDocument();
    clearNavigationGuard(fn);
  });
});
