import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AllPage from "./AllPage";

vi.mock("../lib/api", () => ({
  getAllFeed: vi.fn().mockResolvedValue({
    scope: { type: "all" },
    items: [
      {
        videoId: "v1",
        channelId: "c1",
        title: "First Video",
        thumbUrl: "",
        publishedAt: "2026-07-01T00:00:00Z",
        durationSeconds: 120,
        watched: false,
      },
    ],
  }),
}));

describe("AllPage", () => {
  it("renders queue items from API", async () => {
    render(
      <MemoryRouter>
        <AllPage />
      </MemoryRouter>
    );
     const matches = await screen.findAllByText(/first video/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);

    // Use a flexible matcher in case text is split across elements
    expect(
      await screen.findByText((content) => content.toLowerCase().includes("first"))
    ).toBeInTheDocument();
  });
});
