import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import GuardedLink from "./GuardedLink";
import { setNavigationGuard, clearNavigationGuard } from "../lib/navigationGuard";

function renderLink() {
  return render(
    <MemoryRouter initialEntries={["/from"]}>
      <Routes>
        <Route path="/from" element={<GuardedLink to="/to">Go</GuardedLink>} />
        <Route path="/to" element={<div>Arrived</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GuardedLink", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("navigates normally when there is no unsaved-changes guard", async () => {
    const user = userEvent.setup();
    renderLink();

    await user.click(screen.getByRole("link", { name: "Go" }));

    expect(await screen.findByText("Arrived")).toBeInTheDocument();
  });

  it("navigates after the user confirms leaving with unsaved changes", async () => {
    const fn = () => true;
    setNavigationGuard(fn);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    renderLink();

    await user.click(screen.getByRole("link", { name: "Go" }));

    expect(await screen.findByText("Arrived")).toBeInTheDocument();
    clearNavigationGuard(fn);
  });

  it("stays on the page when the user cancels the confirm dialog", async () => {
    const fn = () => true;
    setNavigationGuard(fn);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    renderLink();

    await user.click(screen.getByRole("link", { name: "Go" }));

    expect(screen.queryByText("Arrived")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go" })).toBeInTheDocument();
    clearNavigationGuard(fn);
  });
});
