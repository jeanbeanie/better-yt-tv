import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SettingsLayout from "./SettingsLayout";
import { deleteAccount, type User } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  deleteAccount: vi.fn(),
}));

function renderLayout(user: User | null) {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<SettingsLayout user={user} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const adminUser: User = {
  id: "user-1",
  email: "admin@example.com",
  google_sub: "google-sub-1",
  is_admin: true,
};

const regularUser: User = {
  id: "user-2",
  email: "user@example.com",
  google_sub: "google-sub-2",
  is_admin: false,
};

describe("SettingsLayout", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.mocked(deleteAccount).mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: vi.fn() },
    });
  });

  it("shows an Admin link for an admin user", () => {
    renderLayout(adminUser);

    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("hides the Admin link for a non-admin user", () => {
    renderLayout(regularUser);

    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("hides the Admin link when user is null", () => {
    renderLayout(null);

    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("deletes the account and redirects home after confirming", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteAccount).mockResolvedValue({ ok: true });

    renderLayout(regularUser);

    await user.click(screen.getByRole("button", { name: "Delete my account and data" }));

    expect(deleteAccount).toHaveBeenCalled();
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/"));
  });

  it("does nothing when the confirm dialog is dismissed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderLayout(regularUser);

    await user.click(screen.getByRole("button", { name: "Delete my account and data" }));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("shows an error and stops redirecting when the delete request fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteAccount).mockRejectedValue(new Error("Failed to delete account"));

    renderLayout(regularUser);

    await user.click(screen.getByRole("button", { name: "Delete my account and data" }));

    expect(await screen.findByText("Failed to delete account")).toBeInTheDocument();
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete my account and data" })).not.toBeDisabled();
  });
});
