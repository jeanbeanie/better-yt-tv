import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AllPage from "./AllPage";
import { getAllFeed } from "../lib/api";

vi.mock("../lib/api", () => ({
  getAllFeed: vi.fn(),
}));

describe("AllPage", () => {
  beforeEach(() => {
    vi.mocked(getAllFeed).mockReset();
  });

  it("renders queue items from API", async () => {
    vi.mocked(getAllFeed).mockResolvedValue({
      items: [
        {
          video_id: "v1",
          channel_id: "c1",
          channel_title: "Channel One",
          title: "First Video",
          thumb_url: "",
          published_at: "2026-07-01T00:00:00Z",
          watched_at: null,
          is_watched: false,
        },
      ],
    });

    render(
      <MemoryRouter>
        <AllPage />
      </MemoryRouter>
    );
     const matches = await screen.findAllByText(/first video/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("hides watched videos from the queue when 'Hide watched' is checked", async () => {
    vi.mocked(getAllFeed).mockResolvedValue({
      items: [
        {
          video_id: "v1",
          channel_id: "c1",
          channel_title: "Channel One",
          title: "Unwatched Video",
          thumb_url: "",
          published_at: "2026-07-01T00:00:00Z",
          watched_at: null,
          is_watched: false,
        },
        {
          video_id: "v2",
          channel_id: "c1",
          channel_title: "Channel One",
          title: "Watched Video",
          thumb_url: "",
          published_at: "2026-07-02T00:00:00Z",
          watched_at: "2026-07-03T00:00:00Z",
          is_watched: true,
        },
      ],
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AllPage />
      </MemoryRouter>
    );

    // Both videos should be in the queue before filtering.
    // "Unwatched Video" is auto-selected as the first item, so it legitimately
    // renders twice (the "now playing" panel and its queue row).
    await screen.findByText("Watched Video");
    expect(screen.getAllByText("Unwatched Video").length).toBeGreaterThanOrEqual(1);

    const hideWatchedCheckbox = screen.getByLabelText(/hide watched/i);
    await user.click(hideWatchedCheckbox);

    // Watched video should be filtered out of the queue entirely
    expect(screen.queryByText("Watched Video")).not.toBeInTheDocument();

    // Unwatched video should still remain visible
    expect(screen.getAllByText("Unwatched Video").length).toBeGreaterThanOrEqual(1);
  });
});
