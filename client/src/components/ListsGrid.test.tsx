import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe } from "vitest-axe";
import ListsGrid from "./ListsGrid";
import {
  getListsSummary,
  refreshAllCache,
  redirectToLoginOrHome,
  shouldRedirectToLogin,
  type ListCardSummary,
} from "../lib/api";

vi.mock("../lib/api", () => ({
  getListsSummary: vi.fn(),
  shouldRedirectToLogin: vi.fn(() => false),
  redirectToLoginOrHome: vi.fn(),
  refreshAllCache: vi.fn(),
}));

const CHANNEL_A = { channelId: "c1", title: "3Blue1Brown", thumbUrl: "https://img/c1.jpg" };
const CHANNEL_B = { channelId: "c2", title: "Veritasium", thumbUrl: "https://img/c2.jpg" };
const CHANNEL_NO_THUMB = { channelId: "c3", title: "Kurzgesagt", thumbUrl: null };

const NEXT_VIDEO = {
  videoId: "vidNext0001",
  title: "Next title",
  thumbUrl: "https://img/next.jpg",
  kind: "next" as const,
};
const RESUME_VIDEO = {
  videoId: "vidSaved001",
  title: "Saved title",
  thumbUrl: "https://img/saved.jpg",
  kind: "resume" as const,
};

const UNWATCHED_NEXT: ListCardSummary = {
  id: "l1",
  name: "Space nerd",
  channels: [CHANNEL_A],
  videoCount: 3,
  unwatchedCount: 2,
  featuredVideo: NEXT_VIDEO,
};
const UNWATCHED_RESUME: ListCardSummary = {
  id: "l2",
  name: "Dev talk",
  channels: [CHANNEL_B],
  videoCount: 4,
  unwatchedCount: 1,
  featuredVideo: RESUME_VIDEO,
};
const CAUGHT_UP_NEXT: ListCardSummary = {
  id: "l3",
  name: "Quick learning",
  channels: [CHANNEL_A, CHANNEL_B],
  videoCount: 2,
  unwatchedCount: 0,
  featuredVideo: NEXT_VIDEO,
};
const CAUGHT_UP_RESUME: ListCardSummary = {
  id: "l4",
  name: "Old news",
  channels: [CHANNEL_B],
  videoCount: 5,
  unwatchedCount: 0,
  featuredVideo: RESUME_VIDEO,
};
const NO_VIDEOS: ListCardSummary = {
  id: "l5",
  name: "Empty",
  channels: [],
  videoCount: 0,
  unwatchedCount: 0,
  featuredVideo: null,
};

const SAVED_KEY = "betterYtTv.selectedVideoId.list.l1";

function renderGrid() {
  return render(
    <MemoryRouter>
      <ListsGrid />
    </MemoryRouter>,
  );
}

async function renderWithLists(lists: ListCardSummary[]) {
  vi.mocked(getListsSummary).mockResolvedValueOnce({ lists });
  const view = renderGrid();
  await waitFor(() => expect(screen.queryByText("Loading lists...")).not.toBeInTheDocument());
  return view;
}

describe("ListsGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(getListsSummary).mockResolvedValue({ lists: [] });
  });

  describe("page states", () => {
    it("shows the loading spinner and no view all link while loading", () => {
      vi.mocked(getListsSummary).mockReturnValueOnce(new Promise(() => {}));

      renderGrid();

      expect(screen.getByRole("heading", { name: "Your lists" })).toBeInTheDocument();
      expect(screen.getByText("Loading lists...")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "View all lists" })).not.toBeInTheDocument();
    });

    it("shows the error and no view all link on error", async () => {
      vi.mocked(getListsSummary).mockRejectedValueOnce(new Error("boom"));

      renderGrid();

      expect(await screen.findByText("boom")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "View all lists" })).not.toBeInTheDocument();
      expect(screen.queryByText("Loading lists...")).not.toBeInTheDocument();
    });

    it("redirects to login on an auth error", async () => {
      vi.mocked(shouldRedirectToLogin).mockReturnValueOnce(true);
      vi.mocked(getListsSummary).mockRejectedValueOnce(new Error("AUTH_REQUIRED"));

      renderGrid();

      expect(await screen.findByText("Your session expired. Redirecting to sign in...")).toBeInTheDocument();
      expect(redirectToLoginOrHome).toHaveBeenCalledTimes(1);
    });

    it("shows the zero lists prompt linking to settings and no view all link", async () => {
      renderGrid();

      expect(await screen.findByText(/You don't have any lists yet\./)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/settings/lists");
      expect(screen.queryByRole("link", { name: "View all lists" })).not.toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("links view all lists to settings with an arrow once a list exists", async () => {
      await renderWithLists([UNWATCHED_NEXT]);

      const link = screen.getByRole("link", { name: "View all lists" });
      expect(link).toHaveAttribute("href", "/settings/lists");
      expect(link.textContent).toContain("→");
    });
  });

  describe("card states", () => {
    it("shows unwatched with the next video", async () => {
      await renderWithLists([UNWATCHED_NEXT]);

      const card = screen.getByRole("listitem");
      expect(within(card).getByText("2 unwatched")).toBeInTheDocument();
      expect(within(card).getByText("Up next: Next title")).toBeInTheDocument();
      expect(card.querySelector(".list-card-thumb img")).toHaveAttribute("src", "https://img/next.jpg");
      expect(card.querySelector("a.list-card-thumb-play")).toHaveAttribute("href", "/lists?listId=l1");
      expect(within(card).getByRole("link", { name: "Space nerd" })).toHaveAttribute(
        "href",
        "/lists?listId=l1",
      );
      expect(within(card).getByRole("link", { name: "Watch Space nerd" })).toHaveAttribute(
        "href",
        "/lists?listId=l1",
      );
    });

    it("shows unwatched with a saved video as continue watching", async () => {
      await renderWithLists([UNWATCHED_RESUME]);

      const card = screen.getByRole("listitem");
      expect(within(card).getByText("1 unwatched")).toBeInTheDocument();
      expect(within(card).getByText("Continue watching: Saved title")).toBeInTheDocument();
      expect(card.querySelector(".list-card-thumb img")).toHaveAttribute("src", "https://img/saved.jpg");
      expect(within(card).getByRole("link", { name: "Watch Dev talk" })).toHaveAttribute(
        "href",
        "/lists?listId=l2",
      );
    });

    it("shows caught up with the next video", async () => {
      await renderWithLists([CAUGHT_UP_NEXT]);

      const card = screen.getByRole("listitem");
      expect(within(card).getByText("All caught up")).toBeInTheDocument();
      expect(within(card).getByText("Up next: Next title")).toBeInTheDocument();
      expect(card.querySelector(".list-card-thumb img")).toHaveAttribute("src", "https://img/next.jpg");
      expect(within(card).getByRole("link", { name: "Watch Quick learning" })).toHaveAttribute(
        "href",
        "/lists?listId=l3",
      );
    });

    it("shows caught up with a saved video as continue watching", async () => {
      await renderWithLists([CAUGHT_UP_RESUME]);

      const card = screen.getByRole("listitem");
      expect(within(card).getByText("All caught up")).toBeInTheDocument();
      expect(within(card).getByText("Continue watching: Saved title")).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: "Watch Old news" })).toBeInTheDocument();
    });

    it("shows no videos with the placeholder and the edit list button", async () => {
      await renderWithLists([NO_VIDEOS]);

      const card = screen.getByRole("listitem");
      expect(within(card).getByText("0 videos")).toBeInTheDocument();
      expect(
        within(card).getByText("No videos in list, add more channels to start watching!"),
      ).toBeInTheDocument();
      expect(card.querySelector(".list-card-thumb img")).toBeNull();
      const thumb = card.querySelector("a.list-card-thumb-play");
      expect(thumb).toHaveAttribute("href", "/settings/lists/l5");
      expect(thumb).toHaveAttribute("aria-hidden", "true");
      expect(thumb).toHaveAttribute("tabindex", "-1");
      expect(thumb?.querySelector(".list-card-thumb-placeholder")).not.toBeNull();
      expect(within(card).getByRole("link", { name: "Edit list Empty" })).toHaveAttribute(
        "href",
        "/settings/lists/l5",
      );
      expect(within(card).getByRole("link", { name: "Empty" })).toHaveAttribute("href", "/lists?listId=l5");
      expect(within(card).getByText("0 channels")).toBeInTheDocument();
    });
  });

  describe("saved video writes", () => {
    it("writes the next video on the name link, thumbnail and Watch for a next card", async () => {
      await renderWithLists([UNWATCHED_NEXT]);
      const user = userEvent.setup();
      const card = screen.getByRole("listitem");

      await user.click(within(card).getByRole("link", { name: "Space nerd" }));
      expect(window.localStorage.getItem(SAVED_KEY)).toBe("vidNext0001");

      window.localStorage.clear();
      await user.click(card.querySelector("a.list-card-thumb") as HTMLElement);
      expect(window.localStorage.getItem(SAVED_KEY)).toBe("vidNext0001");

      window.localStorage.clear();
      await user.click(within(card).getByRole("link", { name: "Watch Space nerd" }));
      expect(window.localStorage.getItem(SAVED_KEY)).toBe("vidNext0001");
    });

    it("leaves a saved video unchanged for a resume card", async () => {
      window.localStorage.setItem("betterYtTv.selectedVideoId.list.l2", "vidOther001");
      await renderWithLists([UNWATCHED_RESUME]);
      const user = userEvent.setup();
      const card = screen.getByRole("listitem");

      await user.click(within(card).getByRole("link", { name: "Dev talk" }));
      await user.click(card.querySelector("a.list-card-thumb") as HTMLElement);
      await user.click(within(card).getByRole("link", { name: "Watch Dev talk" }));

      expect(window.localStorage.getItem("betterYtTv.selectedVideoId.list.l2")).toBe("vidOther001");
    });

    it("writes nothing for a no videos card", async () => {
      window.localStorage.setItem("betterYtTv.selectedVideoId.list.l5", "vidOther001");
      await renderWithLists([NO_VIDEOS]);
      const user = userEvent.setup();
      const card = screen.getByRole("listitem");

      await user.click(card.querySelector("a.list-card-thumb-play") as HTMLElement);
      await user.click(within(card).getByRole("link", { name: "Empty" }));
      await user.click(within(card).getByRole("link", { name: "Edit list Empty" }));

      expect(window.localStorage.getItem("betterYtTv.selectedVideoId.list.l5")).toBe("vidOther001");
      expect(window.localStorage.length).toBe(1);
    });

    it("sends the saved video from storage on mount", async () => {
      window.localStorage.setItem(SAVED_KEY, "vidSaved001");

      await renderWithLists([UNWATCHED_RESUME]);

      expect(getListsSummary).toHaveBeenCalledWith([{ listId: "l1", videoId: "vidSaved001" }]);
    });
  });

  describe("rendering", () => {
    it("renders lists in the order received", async () => {
      const zed = { ...UNWATCHED_NEXT, id: "z1", name: "Zed", unwatchedCount: 1 };
      const mid = { ...UNWATCHED_NEXT, id: "m1", name: "Mid", unwatchedCount: 5 };
      const abe = { ...NO_VIDEOS, id: "a1", name: "Abe", videoCount: 2, unwatchedCount: 0, featuredVideo: NEXT_VIDEO };

      await renderWithLists([zed, mid, abe]);

      const names = screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent);
      expect(names).toEqual(["Zed", "Mid", "Abe"]);
    });

    it("caps avatars at 5 and shows the channel count", async () => {
      const channels = Array.from({ length: 7 }, (_, i) => ({
        channelId: `c${i}`,
        title: `Channel ${i}`,
        thumbUrl: `https://img/c${i}.jpg`,
      }));
      await renderWithLists([{ ...UNWATCHED_NEXT, channels }]);

      const card = screen.getByRole("listitem");
      expect(card.querySelectorAll(".list-card-avatar")).toHaveLength(5);
      expect(within(card).getByText("7 channels")).toBeInTheDocument();
    });

    it("shows the first letter when a channel has no thumbnail", async () => {
      await renderWithLists([{ ...UNWATCHED_NEXT, channels: [CHANNEL_NO_THUMB] }]);

      const card = screen.getByRole("listitem");
      expect(card.querySelector(".list-card-avatar-letter")).toHaveTextContent("K");
      expect(within(card).getByText("1 channel")).toBeInTheDocument();
    });

    it("colors fallback avatars by position in the card", async () => {
      const channels = ["Alpha", "Beta", "Gamma", "Delta"].map((title, i) => ({
        channelId: `c${i}`,
        title,
        thumbUrl: null,
      }));
      await renderWithLists([{ ...UNWATCHED_NEXT, channels }]);

      const card = screen.getByRole("listitem");
      const avatars = card.querySelectorAll(".list-card-avatar");
      expect(avatars).toHaveLength(4);
      expect(avatars[0]).toHaveClass("list-card-avatar-color-1");
      expect(avatars[1]).toHaveClass("list-card-avatar-color-2");
      expect(avatars[2]).toHaveClass("list-card-avatar-color-3");
      expect(avatars[3]).toHaveClass("list-card-avatar-color-1");
      expect(avatars[0]).toHaveTextContent("A");
      expect(avatars[1]).toHaveTextContent("B");
      expect(avatars[2]).toHaveTextContent("G");
      expect(avatars[3]).toHaveTextContent("D");
    });

    it("shows the placeholder with the play overlay when the video has no thumbnail", async () => {
      await renderWithLists([
        { ...UNWATCHED_NEXT, featuredVideo: { ...NEXT_VIDEO, thumbUrl: null } },
      ]);

      const card = screen.getByRole("listitem");
      expect(card.querySelector(".list-card-thumb img")).toBeNull();
      const thumb = card.querySelector("a.list-card-thumb-play");
      expect(thumb).not.toBeNull();
      expect(thumb?.querySelector(".list-card-thumb-placeholder")).not.toBeNull();
    });
  });

  describe("accessibility", () => {
    it("labels every watch and edit link with the list name and keeps thumbnails hidden", async () => {
      const { container } = await renderWithLists([
        UNWATCHED_NEXT,
        UNWATCHED_RESUME,
        NO_VIDEOS,
      ]);

      const watchLinks = screen.getAllByRole("link", { name: /^Watch / });
      const editLinks = screen.getAllByRole("link", { name: /^Edit list / });
      expect(watchLinks.map((link) => link.getAttribute("aria-label"))).toEqual([
        "Watch Space nerd",
        "Watch Dev talk",
      ]);
      expect(editLinks.map((link) => link.getAttribute("aria-label"))).toEqual(["Edit list Empty"]);

      const labels = [...watchLinks, ...editLinks].map((link) => link.getAttribute("aria-label"));
      expect(new Set(labels).size).toBe(labels.length);

      const thumbLinks = container.querySelectorAll("a.list-card-thumb");
      expect(thumbLinks).toHaveLength(3);
      thumbLinks.forEach((link) => {
        expect(link).toHaveAttribute("aria-hidden", "true");
        expect(link).toHaveAttribute("tabindex", "-1");
      });

      screen.getAllByRole("link").forEach((link) => {
        expect(link).toHaveAccessibleName(/\S/);
      });
    });

    it("has no axe violations with mixed card states", async () => {
      const { container } = await renderWithLists([
        UNWATCHED_NEXT,
        UNWATCHED_RESUME,
        CAUGHT_UP_NEXT,
        CAUGHT_UP_RESUME,
        NO_VIDEOS,
      ]);

      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe("refetch on mount", () => {
    it("fetches again on each mount with the saved videos at that moment and never refreshes", async () => {
      const first = renderGrid();
      await waitFor(() => expect(getListsSummary).toHaveBeenCalledTimes(1));
      expect(getListsSummary).toHaveBeenLastCalledWith([]);
      first.unmount();

      window.localStorage.setItem(SAVED_KEY, "vidSaved001");
      renderGrid();
      await waitFor(() => expect(getListsSummary).toHaveBeenCalledTimes(2));
      expect(getListsSummary).toHaveBeenLastCalledWith([{ listId: "l1", videoId: "vidSaved001" }]);

      expect(refreshAllCache).not.toHaveBeenCalled();
    });
  });
});
