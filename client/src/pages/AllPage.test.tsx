import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AllPage from "./AllPage";

vi.mock("../lib/api", () => ({
  getAllFeed: vi.fn().mockResolvedValue({
    items: [
      {
        video_id: "v1",
        channel_id: "c1",
        channel_title: "Channel One",
        title: "First Video",
        thumb_url: "",
        published_at: "2026-07-01T00:00:00Z",
        watched_at: null,
        is_watched: false,
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
  });
});
