import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListsSettingsPage from "./ListsSettingsPage";
import { getLists } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  getLists: vi.fn(),
  getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
  shouldRedirectToLogin: vi.fn(() => false),
}));

describe("ListsSettingsPage", () => {
  beforeEach(() => {
    vi.mocked(getLists).mockReset();
  });

  it("renders lists from the API", async () => {
    vi.mocked(getLists).mockResolvedValue({
      lists: [
        {
          id: "l1",
          name: "News",
          channelCount: 3,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
        },
      ],
    });

    render(<ListsSettingsPage />);

    expect(await screen.findByText("News")).toBeInTheDocument();
    expect(screen.getByText("3 channels")).toBeInTheDocument();
  });

  it("shows singular 'channel' for a count of 1", async () => {
    vi.mocked(getLists).mockResolvedValue({
      lists: [
        {
          id: "l1",
          name: "Solo",
          channelCount: 1,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
        },
      ],
    });

    render(<ListsSettingsPage />);

    expect(await screen.findByText("1 channel")).toBeInTheDocument();
  });

  it("shows the empty state when there are no lists", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [] });

    render(<ListsSettingsPage />);

    expect(await screen.findByText("You don't have any lists yet.")).toBeInTheDocument();
  });

  it("shows an error message when getLists fails", async () => {
    vi.mocked(getLists).mockRejectedValue(new Error("get lists failed: 500"));

    render(<ListsSettingsPage />);

    expect(await screen.findByText("get lists failed: 500")).toBeInTheDocument();
  });
});
