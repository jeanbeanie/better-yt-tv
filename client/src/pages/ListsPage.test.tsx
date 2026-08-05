import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListsPage from "./ListsPage";
import { getLists, getListFeed, markVideoWatched, markVideoUnwatched } from "../lib/api";

vi.mock("../lib/api", () => ({
  getLists: vi.fn(),
  getListFeed: vi.fn(),
  markVideoWatched: vi.fn(),
  markVideoUnwatched: vi.fn(),
  getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
  shouldRedirectToLogin: vi.fn(() => false),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ListsPage />
    </MemoryRouter>,
  );
}

const NEWS_LIST = {
  id: "l1",
  name: "News",
  channelCount: 3,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

const MUSIC_LIST = {
  id: "l2",
  name: "Music",
  channelCount: 2,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

const VIDEO_1 = {
  video_id: "v1",
  channel_id: "c1",
  channel_title: "Channel One",
  title: "First Video",
  thumb_url: "",
  published_at: "2026-08-01T00:00:00Z",
  watched_at: null,
  is_watched: false,
};

const VIDEO_2 = {
  video_id: "v2",
  channel_id: "c1",
  channel_title: "Channel One",
  title: "Second Video",
  thumb_url: "",
  published_at: "2026-08-02T00:00:00Z",
  watched_at: "2026-08-03T00:00:00Z",
  is_watched: true,
};

describe("ListsPage", () => {
  beforeEach(() => {
    vi.mocked(getLists).mockReset();
    vi.mocked(getListFeed).mockReset();
    vi.mocked(markVideoWatched).mockReset();
    vi.mocked(markVideoUnwatched).mockReset();
    window.localStorage.clear();
  });

  it("shows an empty state with a create-list CTA when there are no lists", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [] });

    renderPage();

    expect(
      await screen.findByText("You don't have any lists yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute(
      "href",
      "/settings/lists",
    );
    expect(getListFeed).not.toHaveBeenCalled();
  });

  it("defaults to the first list and shows its feed", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST, MUSIC_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [VIDEO_1],
    });

    renderPage();

    expect((await screen.findAllByText("First Video")).length).toBeGreaterThanOrEqual(1);
    expect(getListFeed).toHaveBeenCalledWith("l1");
    expect(await screen.findByLabelText("Select list:")).toHaveValue("l1");
  });

  it("shows a manage-list CTA when the selected list's feed is empty", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [],
    });

    renderPage();

    expect(
      await screen.findByText("No videos available for this list right now."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage this list" })).toHaveAttribute(
      "href",
      "/settings/lists/l1",
    );
  });

  it("restores the previously selected list from localStorage", async () => {
    window.localStorage.setItem("betterYtTv.selectedListId", "l2");
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST, MUSIC_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l2", name: "Music" },
      items: [],
    });

    renderPage();

    expect(
      await screen.findByText("No videos available for this list right now."),
    ).toBeInTheDocument();
    expect(getListFeed).toHaveBeenCalledWith("l2");
    expect(screen.getByLabelText("Select list:")).toHaveValue("l2");
  });

  it("falls back to the first list if the stored id no longer exists", async () => {
    window.localStorage.setItem("betterYtTv.selectedListId", "stale-id");
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST, MUSIC_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [],
    });

    renderPage();

    expect(
      await screen.findByText("No videos available for this list right now."),
    ).toBeInTheDocument();
    expect(getListFeed).toHaveBeenCalledWith("l1");
    expect(screen.getByLabelText("Select list:")).toHaveValue("l1");
  });

  it("switching the dropdown loads the new list's feed and persists the choice", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST, MUSIC_LIST] });
    vi.mocked(getListFeed).mockImplementation((listId) =>
      Promise.resolve(
        listId === "l1"
          ? { list: { id: "l1", name: "News" }, items: [VIDEO_1] }
          : { list: { id: "l2", name: "Music" }, items: [] },
      ),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("First Video");

    await user.selectOptions(screen.getByLabelText("Select list:"), "l2");

    expect(
      await screen.findByText("No videos available for this list right now."),
    ).toBeInTheDocument();
    expect(getListFeed).toHaveBeenCalledWith("l2");
    expect(window.localStorage.getItem("betterYtTv.selectedListId")).toBe("l2");
  });

  it("hides watched videos from the queue when 'Hide watched' is checked", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [VIDEO_1, VIDEO_2],
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Second Video");
    expect(screen.getAllByText("First Video").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByLabelText(/hide watched/i));

    expect(screen.queryByText("Second Video")).not.toBeInTheDocument();
    expect(screen.getAllByText("First Video").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the Hide watched checkbox visible (and usable) when every video is watched", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [{ ...VIDEO_1, is_watched: true }, VIDEO_2],
    });

    const user = userEvent.setup();
    renderPage();

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

  it("marks a video watched from the queue", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [VIDEO_1],
    });
    vi.mocked(markVideoWatched).mockResolvedValue({ ok: true });

    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("First Video");
    await user.click(screen.getByRole("button", { name: "Watch" }));

    expect(markVideoWatched).toHaveBeenCalledWith("v1");
    expect(getListFeed).toHaveBeenCalledTimes(2);
  });

  it("does not show the full-page loading state when marking a video watched", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [VIDEO_1],
    });
    vi.mocked(markVideoWatched).mockResolvedValue({ ok: true });

    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("First Video");
    expect(screen.queryByText("Loading feed...")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Watch" }));

    // The page should never flash back to the full-page loading state on a
    // watch/unwatch toggle -- only the initial load shows it
    expect(screen.queryByText("Loading feed...")).not.toBeInTheDocument();
    expect(markVideoWatched).toHaveBeenCalledWith("v1");
    expect(getListFeed).toHaveBeenCalledTimes(2);
  });

  it("navigates to the next and previous video in the queue", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [VIDEO_1, { ...VIDEO_2, is_watched: false }],
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("First Video");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByText("Second Video").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getAllByText("First Video").length).toBeGreaterThanOrEqual(1);
  });

  it("shares the catch-up mode preference with /all via the same localStorage key", async () => {
    window.localStorage.setItem("betterYtTv.catchUpMode", "false");
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [VIDEO_1],
    });

    renderPage();

    const catchUpCheckbox = await screen.findByLabelText(/catch-up mode/i);
    expect(catchUpCheckbox).not.toBeChecked();
  });
});
