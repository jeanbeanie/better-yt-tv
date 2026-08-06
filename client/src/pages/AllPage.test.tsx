import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AllPage from "./AllPage";
import { getAllFeed, markVideoWatched, markVideoUnwatched } from "../lib/api";

vi.mock("../lib/api", () => ({
  getAllFeed: vi.fn(),
  markVideoWatched: vi.fn(),
  markVideoUnwatched: vi.fn(),
  getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
  shouldRedirectToLogin: vi.fn(() => false),
  refreshAllCache: vi.fn().mockResolvedValue(undefined),
}));

describe("AllPage", () => {
  beforeEach(() => {
    vi.mocked(getAllFeed).mockReset();
    vi.mocked(markVideoWatched).mockReset();
    vi.mocked(markVideoUnwatched).mockReset();
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

  it("keeps the Hide watched checkbox visible (and usable) when every video is watched", async () => {
    vi.mocked(getAllFeed).mockResolvedValue({
      items: [
        {
          video_id: "v1",
          channel_id: "c1",
          channel_title: "Channel One",
          title: "First Video",
          thumb_url: "",
          published_at: "2026-07-01T00:00:00Z",
          watched_at: "2026-07-02T00:00:00Z",
          is_watched: true,
        },
        {
          video_id: "v2",
          channel_id: "c1",
          channel_title: "Channel One",
          title: "Second Video",
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

    const hideWatchedCheckbox = await screen.findByLabelText(/hide watched/i);
    await user.click(hideWatchedCheckbox);

    // Everything is now watched and hidden -- the checkbox must still be
    // present so the user isn't locked out of turning it back off
    expect(
      await screen.findByText("All videos are watched. Turn off “Hide watched” to see them again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/hide watched/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/catch-up mode/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/hide watched/i));

    expect(screen.getAllByText("First Video").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Second Video").length).toBeGreaterThanOrEqual(1);
  });

  it("does not show the full-page loading state when marking a video watched", async () => {
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
    vi.mocked(markVideoWatched).mockResolvedValue({ ok: true });

    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AllPage />
      </MemoryRouter>
    );

    await screen.findAllByText("First Video");
    expect(screen.queryByText("Loading feed...")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Watch" }));

    // The page should never flash back to the full-page loading state on a
    // watch/unwatch toggle -- only the initial mount shows it
    expect(screen.queryByText("Loading feed...")).not.toBeInTheDocument();
    expect(markVideoWatched).toHaveBeenCalledWith("v1");
  });
});
