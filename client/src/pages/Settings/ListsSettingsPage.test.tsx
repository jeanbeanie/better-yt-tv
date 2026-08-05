import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListsSettingsPage from "./ListsSettingsPage";
import { getLists, createList } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  getLists: vi.fn(),
  createList: vi.fn(),
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

  it("links each list row to its editor route", async () => {
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

    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/settings/lists/l1",
    );
  });
});
