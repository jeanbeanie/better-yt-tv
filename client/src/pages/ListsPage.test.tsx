import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListsPage from "./ListsPage";
import { getLists, getListFeed, markVideoWatched, markVideoUnwatched, refreshAllCache } from "../lib/api";

vi.mock("../lib/api", () => ({
  getLists: vi.fn(),
  getListFeed: vi.fn(),
  markVideoWatched: vi.fn(),
  markVideoUnwatched: vi.fn(),
  getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
  shouldRedirectToLogin: vi.fn(() => false),
  refreshAllCache: vi.fn(),
}));

const REFRESH_RESULT = {
  ok: true as const,
  refreshPaused: false,
  refreshedChannels: 0,
  skippedChannels: 0,
  failedChannels: 0,
  cachedVideos: 0,
};

function renderPage(initialPath = "/lists") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
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

describe("ListsPage", () => {
  beforeEach(() => {
    vi.mocked(getLists).mockReset();
    vi.mocked(getListFeed).mockReset();
    vi.mocked(markVideoWatched).mockReset();
    vi.mocked(markVideoUnwatched).mockReset();
    vi.mocked(refreshAllCache).mockReset();
    vi.mocked(refreshAllCache).mockResolvedValue(REFRESH_RESULT);
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
      hasMore: false,
    });

    renderPage();

    expect((await screen.findAllByText("First Video")).length).toBeGreaterThanOrEqual(1);
    expect(getListFeed).toHaveBeenCalledWith("l1", { limit: 50 });
    expect(await screen.findByLabelText("Select list:")).toHaveValue("l1");
  });

  it("shows a manage-list CTA when the selected list's feed is empty", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [],
      hasMore: false,
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
      hasMore: false,
    });

    renderPage();

    // items starts at [] and loadingFeed starts at false, so the empty-state
    // text can transiently match before getListFeed has even been called --
    // wait for the actual fetch first, which is the only unambiguous signal
    // that the right list was restored, before trusting what's on screen
    await waitFor(() => expect(getListFeed).toHaveBeenCalledWith("l2", { limit: 50 }));
    expect(
      await screen.findByText("No videos available for this list right now."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Select list:")).toHaveValue("l2");
  });

  it("falls back to the first list if the stored id no longer exists", async () => {
    window.localStorage.setItem("betterYtTv.selectedListId", "stale-id");
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST, MUSIC_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [],
      hasMore: false,
    });

    renderPage();

    // Same reasoning as the "restores from localStorage" test above: wait
    // for the real fetch before trusting the empty-state text on screen
    await waitFor(() => expect(getListFeed).toHaveBeenCalledWith("l1", { limit: 50 }));
    expect(
      await screen.findByText("No videos available for this list right now."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Select list:")).toHaveValue("l1");
  });

  it("selects the list from a ?listId= URL param, ahead of the stored selection", async () => {
    window.localStorage.setItem("betterYtTv.selectedListId", "l1");
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST, MUSIC_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l2", name: "Music" },
      items: [],
      hasMore: false,
    });

    renderPage("/lists?listId=l2");

    await waitFor(() => expect(getListFeed).toHaveBeenCalledWith("l2", { limit: 50 }));
    expect(screen.getByLabelText("Select list:")).toHaveValue("l2");
    // picking it up also persists it, the same as a manual dropdown selection
    expect(window.localStorage.getItem("betterYtTv.selectedListId")).toBe("l2");
  });

  it("ignores a ?listId= that doesn't match any of the loaded lists", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST, MUSIC_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [],
      hasMore: false,
    });

    renderPage("/lists?listId=nonexistent");

    await waitFor(() => expect(getListFeed).toHaveBeenCalledWith("l1", { limit: 50 }));
    expect(screen.getByLabelText("Select list:")).toHaveValue("l1");
  });

  it("switching the dropdown loads the new list's feed and persists the choice", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST, MUSIC_LIST] });
    vi.mocked(getListFeed).mockImplementation((listId) =>
      Promise.resolve(
        listId === "l1"
          ? { list: { id: "l1", name: "News" }, items: [VIDEO_1], hasMore: false }
          : { list: { id: "l2", name: "Music" }, items: [], hasMore: false },
      ),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("First Video");

    await user.selectOptions(screen.getByLabelText("Select list:"), "l2");

    expect(
      await screen.findByText("No videos available for this list right now."),
    ).toBeInTheDocument();
    expect(getListFeed).toHaveBeenCalledWith("l2", { limit: 50 });
    expect(window.localStorage.getItem("betterYtTv.selectedListId")).toBe("l2");
  });

  it("does not show the full-page loading state when marking a video watched", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [VIDEO_1],
      hasMore: false,
    });
    vi.mocked(markVideoWatched).mockResolvedValue({ ok: true });

    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("First Video");
    expect(screen.queryByText("Loading feed...")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /mark .* as watched/i }));

    // The page should never flash back to the full-page loading state on a
    // watch/unwatch toggle -- only the initial load shows it
    expect(screen.queryByText("Loading feed...")).not.toBeInTheDocument();
    expect(markVideoWatched).toHaveBeenCalledWith("v1");
  });

  it("shows a paused notice when refreshAllCache reports refreshPaused", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [VIDEO_1],
      hasMore: false,
    });
    vi.mocked(refreshAllCache).mockResolvedValue({ ...REFRESH_RESULT, refreshPaused: true });

    renderPage();

    expect(await screen.findByText(/temporarily paused/i)).toBeInTheDocument();
  });

  it("does not show a paused notice when refreshes are running normally", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [VIDEO_1],
      hasMore: false,
    });

    renderPage();

    await screen.findAllByText("First Video");
    expect(screen.queryByText(/temporarily paused/i)).not.toBeInTheDocument();
  });
});
