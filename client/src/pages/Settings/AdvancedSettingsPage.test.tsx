import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdvancedSettingsPage from "./AdvancedSettingsPage";
import { deleteAccount } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  deleteAccount: vi.fn(),
}));

describe("AdvancedSettingsPage", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.mocked(deleteAccount).mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: vi.fn() },
    });
  });

  it("deletes the account and redirects home after confirming", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteAccount).mockResolvedValue({ ok: true });

    render(<AdvancedSettingsPage />);

    await user.click(screen.getByRole("button", { name: "Delete my account and data" }));

    expect(deleteAccount).toHaveBeenCalled();
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/"));
  });

  it("does nothing when the confirm dialog is dismissed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<AdvancedSettingsPage />);

    await user.click(screen.getByRole("button", { name: "Delete my account and data" }));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("shows an error and stops redirecting when the delete request fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteAccount).mockRejectedValue(new Error("Failed to delete account"));

    render(<AdvancedSettingsPage />);

    await user.click(screen.getByRole("button", { name: "Delete my account and data" }));

    expect(await screen.findByText("Failed to delete account")).toBeInTheDocument();
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete my account and data" })).not.toBeDisabled();
  });
});
