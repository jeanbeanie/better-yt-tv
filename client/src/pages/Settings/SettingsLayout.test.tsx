import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect } from "vitest";
import SettingsLayout from "./SettingsLayout";
import type { User } from "../../lib/api";

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
});
