import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListEditorPage from "./ListEditorPage";
import { getList, getChannels, saveList, deleteList, ApiError } from "../../lib/api";

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    getList: vi.fn(),
    getChannels: vi.fn(),
    saveList: vi.fn(),
    deleteList: vi.fn(),
    getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
    shouldRedirectToLogin: vi.fn(() => false),
  };
});

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

  it("caps search results at 25 and shows a truncation hint", async () => {
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
      channels: Array.from({ length: 30 }, (_, i) => ({
        channelId: `c${i + 1}`,
        title: `Channel ${String(i + 1).padStart(2, "0")}`,
        thumbUrl: null,
        enabledAll: true,
        enabledLive: true,
        excludedShorts: false,
      })),
    });

    renderPage("l1");

    await screen.findByText("Channel 01");

    expect(
      screen.getByText("Showing 25 of 30 matches -- refine your search to narrow results"),
    ).toBeInTheDocument();
    expect(screen.getByText("Channel 25")).toBeInTheDocument();
    expect(screen.queryByText("Channel 26")).not.toBeInTheDocument();
    expect(screen.queryByText("Channel 30")).not.toBeInTheDocument();
  });

  it("does not show the truncation hint when results are under the cap", async () => {
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

    renderPage("l1");

    await screen.findByText("Adam Ragusea");

    expect(screen.queryByText(/refine your search to narrow results/)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Save list" }));

    expect(saveList).toHaveBeenCalledWith("l1", { name: "Music", channelIds: ["c1"] });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(getList).toHaveBeenCalledTimes(2);
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
    await user.click(screen.getByRole("button", { name: "Save list" }));

    expect(
      await screen.findByText("You already have a list with this name."),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Music")).toBeInTheDocument();
    expect(getList).toHaveBeenCalledTimes(1);
  });

  it("disables the Save button when the name is empty or whitespace-only", async () => {
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
    const saveButton = screen.getByRole("button", { name: "Save list" });
    expect(saveButton).not.toBeDisabled();

    await user.clear(nameInput);
    await user.type(nameInput, "   ");
    expect(saveButton).toBeDisabled();
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
