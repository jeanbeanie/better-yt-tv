import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListEditorPage from "./ListEditorPage";
import { getList, getChannels, ApiError } from "../../lib/api";

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    getList: vi.fn(),
    getChannels: vi.fn(),
    getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
    shouldRedirectToLogin: vi.fn(() => false),
  };
});

function renderPage(listId = "l1") {
  return render(
    <MemoryRouter initialEntries={[`/settings/lists/${listId}`]}>
      <Routes>
        <Route path="/settings/lists/:listId" element={<ListEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ListEditorPage", () => {
  beforeEach(() => {
    vi.mocked(getList).mockReset();
    vi.mocked(getChannels).mockReset();
    vi.mocked(getChannels).mockResolvedValue({ channels: [] });
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
    expect(await screen.findByText("News")).toBeInTheDocument();
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

    await screen.findByText("News");
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

    await screen.findByText("News");
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
});
