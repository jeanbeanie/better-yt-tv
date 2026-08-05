import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListsPage from "./ListsPage";
import { getLists, getListFeed } from "../lib/api";

vi.mock("../lib/api", () => ({
  getLists: vi.fn(),
  getListFeed: vi.fn(),
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

describe("ListsPage", () => {
  beforeEach(() => {
    vi.mocked(getLists).mockReset();
    vi.mocked(getListFeed).mockReset();
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

  it("defaults to the first list and shows its name and feed", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST, MUSIC_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [VIDEO_1],
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "News" })).toBeInTheDocument();
    expect(getListFeed).toHaveBeenCalledWith("l1");
    expect(await screen.findByText("1 video loaded.")).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "Music" })).toBeInTheDocument();
    expect(getListFeed).toHaveBeenCalledWith("l2");
  });

  it("falls back to the first list if the stored id no longer exists", async () => {
    window.localStorage.setItem("betterYtTv.selectedListId", "stale-id");
    vi.mocked(getLists).mockResolvedValue({ lists: [NEWS_LIST, MUSIC_LIST] });
    vi.mocked(getListFeed).mockResolvedValue({
      list: { id: "l1", name: "News" },
      items: [],
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "News" })).toBeInTheDocument();
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

    await screen.findByRole("heading", { name: "News" });

    await user.selectOptions(screen.getByLabelText("Select list:"), "l2");

    expect(await screen.findByRole("heading", { name: "Music" })).toBeInTheDocument();
    expect(getListFeed).toHaveBeenCalledWith("l2");
    expect(window.localStorage.getItem("betterYtTv.selectedListId")).toBe("l2");
  });
});
