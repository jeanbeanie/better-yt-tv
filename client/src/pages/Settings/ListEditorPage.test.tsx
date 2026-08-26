import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListEditorPage from "./ListEditorPage";
import { getList, getChannels, saveList, deleteList, refreshAllCache, ApiError } from "../../lib/api";

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    getList: vi.fn(),
    getChannels: vi.fn(),
    saveList: vi.fn(),
    deleteList: vi.fn(),
    refreshAllCache: vi.fn(),
    getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
    shouldRedirectToLogin: vi.fn(() => false),
  };
});

function makeChannel(i: number, title: string) {
  return {
    channelId: `c${i}`,
    title,
    thumbUrl: null,
    enabledAll: true,
    enabledLive: true,
    excludedShorts: false,
  };
}

// 35 generic channels plus one channel with a distinct name, to exercise
// both pagination (35 is more than PAGE_SIZE of 25) and searching for
// something far down the list, the actual scenario Load more is for
const MANY_CHANNELS = [
  ...Array.from({ length: 35 }, (_, i) => makeChannel(i + 1, `Channel ${String(i + 1).padStart(2, "0")}`)),
  makeChannel(999, "Zebra Exclusive"),
];

function renderPage(listId = "l1") {
  return render(
    <MemoryRouter initialEntries={[`/settings/lists/${listId}`]}>
      <Routes>
        <Route path="/settings/lists/:listId" element={<ListEditorPage />} />
        <Route path="/settings/lists" element={<div>Lists overview page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ListEditorPage", () => {
  beforeEach(() => {
    vi.mocked(getList).mockReset();
    vi.mocked(getChannels).mockReset();
    vi.mocked(getChannels).mockResolvedValue({ channels: [] });
    vi.mocked(saveList).mockReset();
    vi.mocked(deleteList).mockReset();
    vi.mocked(refreshAllCache).mockReset().mockResolvedValue({
      ok: true,
      refreshPaused: false,
      refreshedChannels: 0,
      skippedChannels: 0,
      failedChannels: 0,
      cachedVideos: 0,
    });
  });

  it("loads and displays the list name", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });

    renderPage("l1");

    expect(getList).toHaveBeenCalledWith("l1");
    expect(await screen.findByDisplayValue("News")).toBeInTheDocument();
  });

  it("shows a not-found message for a 404", async () => {
    vi.mocked(getList).mockRejectedValue(new ApiError("List not found", 404));

    renderPage("nonexistent");

    expect(await screen.findByText("List not found.")).toBeInTheDocument();
  });

  it("shows an error message for a non-404 failure", async () => {
    vi.mocked(getList).mockRejectedValue(new Error("get list failed: 500"));

    renderPage("l1");

    expect(await screen.findByText("get list failed: 500")).toBeInTheDocument();
  });

  it("seeds selected channels from the loaded list and shows them with a Remove button", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: ["c1"],
        channels: [{ channelId: "c1", title: "Existing Channel", thumbUrl: null }],
      },
    });

    renderPage("l1");

    expect(await screen.findByText("Existing Channel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("adds a channel from search results and it moves out of the results list", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });
    vi.mocked(getChannels).mockResolvedValue({
      channels: [
        {
          channelId: "c1",
          title: "Adam Ragusea",
          thumbUrl: null,
          enabledAll: true,
          enabledLive: true,
          excludedShorts: false,
        },
      ],
    });

    const user = userEvent.setup();
    renderPage("l1");

    await screen.findByDisplayValue("News");
    const result = await screen.findByText("Adam Ragusea");

    expect(screen.getByText("No channels selected yet.")).toBeInTheDocument();

    await user.click(result);

    expect(screen.queryByText("No channels selected yet.")).not.toBeInTheDocument();
    // Now appears in the selected list (with a Remove button)
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("removing a selected channel returns it to the search results", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: ["c1"],
        channels: [{ channelId: "c1", title: "Adam Ragusea", thumbUrl: null }],
      },
    });
    vi.mocked(getChannels).mockResolvedValue({
      channels: [
        {
          channelId: "c1",
          title: "Adam Ragusea",
          thumbUrl: null,
          enabledAll: true,
          enabledLive: true,
          excludedShorts: false,
        },
      ],
    });

    const user = userEvent.setup();
    renderPage("l1");

    await screen.findByDisplayValue("News");
    const removeButton = await screen.findByRole("button", { name: "Remove" });
    expect(screen.getByText("Adam Ragusea")).toBeInTheDocument();

    await user.click(removeButton);

    expect(screen.getByText("No channels selected yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getByText("Adam Ragusea")).toBeInTheDocument();
  });

  it("filters search results by the search text", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });
    vi.mocked(getChannels).mockResolvedValue({
      channels: [
        {
          channelId: "c1",
          title: "Adam Ragusea",
          thumbUrl: null,
          enabledAll: true,
          enabledLive: true,
          excludedShorts: false,
        },
        {
          channelId: "c2",
          title: "Veritasium",
          thumbUrl: null,
          enabledAll: true,
          enabledLive: true,
          excludedShorts: false,
        },
      ],
    });

    const user = userEvent.setup();
    renderPage("l1");

    await screen.findByText("Adam Ragusea");
    expect(screen.getByText("Veritasium")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search your subscribed channels"), "veri");

    expect(screen.queryByText("Adam Ragusea")).not.toBeInTheDocument();
    expect(screen.getByText("Veritasium")).toBeInTheDocument();
  });

  it("renders only the first page of search results initially, with a count indicator", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });
    vi.mocked(getChannels).mockResolvedValue({ channels: MANY_CHANNELS });

    renderPage("l1");

    await screen.findByText("Channel 01");
    expect(screen.getByText("Showing 25 of 36 channels")).toBeInTheDocument();
    expect(screen.queryByText("Channel 35")).not.toBeInTheDocument();
    expect(screen.queryByText("Zebra Exclusive")).not.toBeInTheDocument();
  });

  it("reveals more search results when Load more is clicked", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });
    vi.mocked(getChannels).mockResolvedValue({ channels: MANY_CHANNELS });

    const user = userEvent.setup();
    renderPage("l1");

    await screen.findByText("Channel 01");
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Zebra Exclusive")).toBeInTheDocument();
    expect(screen.getByText("Showing 36 of 36 channels")).toBeInTheDocument();
    // all revealed, so the button should be gone
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("resets back to the first page when the search text changes", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });
    vi.mocked(getChannels).mockResolvedValue({ channels: MANY_CHANNELS });

    const user = userEvent.setup();
    renderPage("l1");

    await screen.findByText("Channel 01");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Zebra Exclusive");

    // search narrows straight to a channel that would otherwise require
    // clicking Load more to reach
    await user.type(screen.getByPlaceholderText("Search your subscribed channels"), "Zebra");

    expect(await screen.findByText("Zebra Exclusive")).toBeInTheDocument();
    expect(screen.queryByText("Channel 01")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 1 matching channels")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("lets you type a new name", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });

    const user = userEvent.setup();
    renderPage("l1");

    const nameInput = await screen.findByDisplayValue("News");
    await user.clear(nameInput);
    await user.type(nameInput, "Music");

    expect(screen.getByDisplayValue("Music")).toBeInTheDocument();
  });

  it("saves the trimmed name and current channel selection, then reconciles from the server", async () => {
    vi.mocked(getList)
      .mockResolvedValueOnce({
        list: {
          id: "l1",
          name: "News",
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
          channelIds: ["c1"],
          channels: [{ channelId: "c1", title: "Adam Ragusea", thumbUrl: null }],
        },
      })
      .mockResolvedValueOnce({
        list: {
          id: "l1",
          name: "Music",
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-02T00:00:00Z",
          channelIds: ["c1"],
          channels: [{ channelId: "c1", title: "Adam Ragusea", thumbUrl: null }],
        },
      });
    vi.mocked(saveList).mockResolvedValue({
      list: {
        id: "l1",
        name: "Music",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-02T00:00:00Z",
        channelIds: ["c1"],
        channels: [{ channelId: "c1", title: "Adam Ragusea", thumbUrl: null }],
      },
    });

    const user = userEvent.setup();
    renderPage("l1");

    const nameInput = await screen.findByDisplayValue("News");
    await user.clear(nameInput);
    await user.type(nameInput, "  Music  ");
    await user.click(screen.getAllByRole("button", { name: "Save list" })[0]);

    expect(saveList).toHaveBeenCalledWith("l1", { name: "Music", channelIds: ["c1"] });
    expect(await screen.findAllByText("Saved")).toHaveLength(2);
    expect(getList).toHaveBeenCalledTimes(2);
    expect(refreshAllCache).toHaveBeenCalledWith({ manual: true });
  });

  it("shows a clean error and keeps current edits when save fails (e.g. duplicate name)", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });
    vi.mocked(saveList).mockRejectedValue(
      new Error("You already have a list with this name."),
    );

    const user = userEvent.setup();
    renderPage("l1");

    const nameInput = await screen.findByDisplayValue("News");
    await user.clear(nameInput);
    await user.type(nameInput, "Music");
    await user.click(screen.getAllByRole("button", { name: "Save list" })[0]);

    expect(
      await screen.findAllByText("You already have a list with this name."),
    ).toHaveLength(2);
    expect(screen.getByDisplayValue("Music")).toBeInTheDocument();
    expect(getList).toHaveBeenCalledTimes(1);
  });

  it("disables both Save buttons when the name is empty or whitespace-only", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });

    const user = userEvent.setup();
    renderPage("l1");

    const nameInput = await screen.findByDisplayValue("News");
    const saveButtons = screen.getAllByRole("button", { name: "Save list" });
    expect(saveButtons).toHaveLength(2);
    saveButtons.forEach((button) => expect(button).not.toBeDisabled());

    await user.clear(nameInput);
    await user.type(nameInput, "   ");
    screen
      .getAllByRole("button", { name: "Save list" })
      .forEach((button) => expect(button).toBeDisabled());
  });

  it("saves when the bottom Save button is clicked", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });
    vi.mocked(saveList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-02T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });

    const user = userEvent.setup();
    renderPage("l1");

    await screen.findByDisplayValue("News");
    const saveButtons = screen.getAllByRole("button", { name: "Save list" });
    await user.click(saveButtons[saveButtons.length - 1]);

    expect(saveList).toHaveBeenCalledWith("l1", { name: "News", channelIds: [] });
    expect(await screen.findAllByText("Saved")).toHaveLength(2);
  });

  it("confirms, deletes, and navigates back to the lists overview on success", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });
    vi.mocked(deleteList).mockResolvedValue({ ok: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    renderPage("l1");

    await screen.findByDisplayValue("News");
    await user.click(screen.getByRole("button", { name: "Delete list" }));

    expect(confirmSpy).toHaveBeenCalledWith("Delete this list? This can't be undone.");
    expect(deleteList).toHaveBeenCalledWith("l1");
    expect(await screen.findByText("Lists overview page")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("does nothing if the delete confirmation is cancelled", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    renderPage("l1");

    await screen.findByDisplayValue("News");
    await user.click(screen.getByRole("button", { name: "Delete list" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteList).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("News")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("shows an error and stays on the page when delete fails", async () => {
    vi.mocked(getList).mockResolvedValue({
      list: {
        id: "l1",
        name: "News",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });
    vi.mocked(deleteList).mockRejectedValue(new Error("delete list failed: 500"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    renderPage("l1");

    await screen.findByDisplayValue("News");
    await user.click(screen.getByRole("button", { name: "Delete list" }));

    expect(await screen.findByText("delete list failed: 500")).toBeInTheDocument();
    expect(screen.getByDisplayValue("News")).toBeInTheDocument();
    expect(screen.queryByText("Lists overview page")).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
