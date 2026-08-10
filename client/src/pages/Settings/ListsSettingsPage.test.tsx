import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListsSettingsPage from "./ListsSettingsPage";
import { getLists, createList, deleteList } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  getLists: vi.fn(),
  createList: vi.fn(),
  deleteList: vi.fn(),
  getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
  shouldRedirectToLogin: vi.fn(() => false),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ListsSettingsPage />
    </MemoryRouter>,
  );
}

describe("ListsSettingsPage", () => {
  beforeEach(() => {
    vi.mocked(getLists).mockReset();
    vi.mocked(createList).mockReset();
    vi.mocked(deleteList).mockReset();
  });

  it("renders lists from the API", async () => {
    vi.mocked(getLists).mockResolvedValue({
      lists: [
        {
          id: "l1",
          name: "News",
          channelCount: 3,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("News")).toBeInTheDocument();
    expect(screen.getByText("3 channels")).toBeInTheDocument();
  });

  it("shows singular 'channel' for a count of 1", async () => {
    vi.mocked(getLists).mockResolvedValue({
      lists: [
        {
          id: "l1",
          name: "Solo",
          channelCount: 1,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("1 channel")).toBeInTheDocument();
  });

  it("shows the empty state when there are no lists", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [] });

    renderPage();

    expect(await screen.findByText("You don't have any lists yet.")).toBeInTheDocument();
  });

  it("shows an error message when getLists fails", async () => {
    vi.mocked(getLists).mockRejectedValue(new Error("get lists failed: 500"));

    renderPage();

    expect(await screen.findByText("get lists failed: 500")).toBeInTheDocument();
  });

  it("creates a list, trims the name, clears the input, and refreshes the list", async () => {
    vi.mocked(getLists)
      .mockResolvedValueOnce({ lists: [] })
      .mockResolvedValueOnce({
        lists: [
          {
            id: "l2",
            name: "Music",
            channelCount: 0,
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z",
          },
        ],
      });
    vi.mocked(createList).mockResolvedValue({
      list: {
        id: "l2",
        name: "Music",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        channelIds: [],
        channels: [],
      },
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("You don't have any lists yet.");

    const input = screen.getByPlaceholderText("New list name");
    await user.type(input, "  Music  ");
    await user.click(screen.getByRole("button", { name: "Create new list" }));

    expect(createList).toHaveBeenCalledWith("Music");
    expect(await screen.findByText("Music")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(getLists).toHaveBeenCalledTimes(2);
  });

  it("shows a clean error and keeps the input populated when createList fails (e.g. duplicate name)", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [] });
    vi.mocked(createList).mockRejectedValue(
      new Error("You already have a list with this name."),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("You don't have any lists yet.");

    const input = screen.getByPlaceholderText("New list name");
    await user.type(input, "News");
    await user.click(screen.getByRole("button", { name: "Create new list" }));

    expect(
      await screen.findByText("You already have a list with this name."),
    ).toBeInTheDocument();
    expect(input).toHaveValue("News");
  });

  it("disables the create button while the input is empty or only whitespace", async () => {
    vi.mocked(getLists).mockResolvedValue({ lists: [] });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("You don't have any lists yet.");

    const button = screen.getByRole("button", { name: "Create new list" });
    expect(button).toBeDisabled();

    await user.type(screen.getByPlaceholderText("New list name"), "   ");
    expect(button).toBeDisabled();
  });

  it("links each list row to its editor route, from both the name and Edit", async () => {
    vi.mocked(getLists).mockResolvedValue({
      lists: [
        {
          id: "l1",
          name: "News",
          channelCount: 3,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
        },
      ],
    });

    renderPage();

    await screen.findByText("News");

    expect(screen.getByRole("link", { name: "News" })).toHaveAttribute(
      "href",
      "/settings/lists/l1",
    );
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/settings/lists/l1",
    );
  });

  it("confirms, deletes, and refetches the list on success", async () => {
    vi.mocked(getLists)
      .mockResolvedValueOnce({
        lists: [
          {
            id: "l1",
            name: "News",
            channelCount: 3,
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({ lists: [] });
    vi.mocked(deleteList).mockResolvedValue({ ok: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("News");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalledWith("Delete this list? This can't be undone.");
    expect(deleteList).toHaveBeenCalledWith("l1");
    expect(await screen.findByText("You don't have any lists yet.")).toBeInTheDocument();
    expect(getLists).toHaveBeenCalledTimes(2);

    confirmSpy.mockRestore();
  });

  it("does nothing if the delete confirmation is cancelled", async () => {
    vi.mocked(getLists).mockResolvedValue({
      lists: [
        {
          id: "l1",
          name: "News",
          channelCount: 3,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
        },
      ],
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("News");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteList).not.toHaveBeenCalled();
    expect(screen.getByText("News")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("shows an error and keeps the list when delete fails", async () => {
    vi.mocked(getLists).mockResolvedValue({
      lists: [
        {
          id: "l1",
          name: "News",
          channelCount: 3,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
        },
      ],
    });
    vi.mocked(deleteList).mockRejectedValue(new Error("delete list failed: 500"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("News");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("delete list failed: 500")).toBeInTheDocument();
    expect(screen.getByText("News")).toBeInTheDocument();
    expect(getLists).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });
});
