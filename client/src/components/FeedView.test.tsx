import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import FeedView from "./FeedView";
import type { FeedItem } from "../lib/api";

const VIDEO_1: FeedItem = {
  video_id: "v1",
  channel_id: "c1",
  channel_title: "Channel One",
  title: "First Video",
  thumb_url: "",
  published_at: "2026-08-01T00:00:00Z",
  watched_at: null,
  is_watched: false,
};

const VIDEO_2: FeedItem = {
  video_id: "v2",
  channel_id: "c1",
  channel_title: "Channel One",
  title: "Second Video",
  thumb_url: "",
  published_at: "2026-08-02T00:00:00Z",
  watched_at: "2026-08-03T00:00:00Z",
  is_watched: true,
};

describe("FeedView", () => {
  it("hides watched videos from the queue when 'Hide watched' is checked", async () => {
    const user = userEvent.setup();

    render(
      <FeedView
        items={[VIDEO_1, VIDEO_2]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey=""
      />,
    );

    await screen.findByText("Second Video");
    expect(screen.getAllByText("First Video").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByLabelText(/hide watched/i));

    expect(screen.queryByText("Second Video")).not.toBeInTheDocument();
    expect(screen.getAllByText("First Video").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onSetWatched with the toggled state when the watch toggle is clicked", async () => {
    const onSetWatched = vi.fn();
    const user = userEvent.setup();

    render(
      <FeedView
        items={[VIDEO_1]}
        onSetWatched={onSetWatched}
        emptyState={<div />}
        storageKey=""
      />,
    );

    await screen.findAllByText("First Video");
    await user.click(screen.getByRole("button", { name: /mark .* as watched/i }));

    expect(onSetWatched).toHaveBeenCalledWith("v1", true);
  });

  it("keeps the Hide watched checkbox visible (and usable) when every video is watched", async () => {
    const user = userEvent.setup();

    render(
      <FeedView
        items={[{ ...VIDEO_1, is_watched: true }, VIDEO_2]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey=""
      />,
    );

    await user.click(await screen.findByLabelText(/hide watched/i));

    // checkbox must stay reachable to turn the filter back off
    expect(
      await screen.findByText("All videos are watched. Turn off “Hide watched” to see them again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/hide watched/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/catch-up mode/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/hide watched/i));

    expect(screen.getAllByText("First Video").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Second Video").length).toBeGreaterThanOrEqual(1);
  });

  it("navigates to the next and previous video in the queue", async () => {
    const user = userEvent.setup();

    render(
      <FeedView
        items={[VIDEO_1, { ...VIDEO_2, is_watched: false }]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey=""
      />,
    );

    // player nav only renders once the selection effect has picked the first item
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(screen.getAllByText("Second Video").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getAllByText("First Video").length).toBeGreaterThanOrEqual(1);
  });

  it("restores catch-up mode from localStorage", async () => {
    window.localStorage.setItem("betterYtTv.catchUpMode", "false");

    render(
      <FeedView
        items={[VIDEO_1]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey=""
      />,
    );

    expect(await screen.findByLabelText(/catch-up mode/i)).not.toBeChecked();
  });
});
