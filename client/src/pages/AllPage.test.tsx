import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AllPage from "./AllPage";
import { getAllFeed, markVideoWatched, markVideoUnwatched } from "../lib/api";

function makeFeedItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    video_id: `v${i}`,
    channel_id: "c1",
    channel_title: "Channel One",
    title: `Video ${i}`,
    thumb_url: "",
    published_at: "2026-07-01T00:00:00Z",
    watched_at: null,
    is_watched: false,
  }));
}

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
      hasMore: false,
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
      hasMore: false,
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
      hasMore: false,
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
      hasMore: false,
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

    await user.click(screen.getByRole("button", { name: /mark .* as watched/i }));

    // The page should never flash back to the full-page loading state on a
    // watch/unwatch toggle -- only the initial mount shows it
    expect(screen.queryByText("Loading feed...")).not.toBeInTheDocument();
    expect(markVideoWatched).toHaveBeenCalledWith("v1");
  });

  it("loadMore appends new items instead of replacing the existing ones", async () => {
    vi.mocked(getAllFeed).mockImplementation(async (params) => {
      if (params?.offset) {
        return {
          items: [{ ...makeFeedItems(1)[0], video_id: "v-more", title: "Second Video" }],
          hasMore: false,
        };
      }
      return { items: [makeFeedItems(1)[0]], hasMore: true };
    });

    render(
      <MemoryRouter>
        <AllPage />
      </MemoryRouter>
    );

    await screen.findAllByText("Video 0");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findAllByText("Second Video")).not.toHaveLength(0);
    // original item should still be there, not replaced by the new page
    expect(screen.getAllByText("Video 0").length).toBeGreaterThanOrEqual(1);
  });

  it("a refresh after marking watched requests enough items to cover what's already loaded", async () => {
    const bigPage = makeFeedItems(51);
    vi.mocked(getAllFeed).mockResolvedValue({ items: bigPage, hasMore: false });
    vi.mocked(markVideoWatched).mockResolvedValue({ ok: true });

    render(
      <MemoryRouter>
        <AllPage />
      </MemoryRouter>
    );

    await screen.findAllByText("Video 0");
    vi.mocked(getAllFeed).mockClear();

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /mark .* as watched/i })[0]);

    await waitFor(() => expect(getAllFeed).toHaveBeenCalled());
    expect(getAllFeed).toHaveBeenCalledWith({ limit: 51 });
  });
});
