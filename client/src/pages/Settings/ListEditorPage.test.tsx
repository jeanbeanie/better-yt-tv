import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListEditorPage from "./ListEditorPage";
import { getList, ApiError } from "../../lib/api";

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    getList: vi.fn(),
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
});
