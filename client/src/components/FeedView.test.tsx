import { render, screen, waitFor } from "@testing-library/react";
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

  it("calls onSetWatched with false when toggling a watched video", async () => {
    const onSetWatched = vi.fn();
    const user = userEvent.setup();

    render(
      <FeedView
        items={[VIDEO_2]}
        onSetWatched={onSetWatched}
        emptyState={<div />}
        storageKey=""
      />,
    );

    await screen.findAllByText("Second Video");
    await user.click(screen.getByRole("button", { name: /mark .* as unwatched/i }));

    expect(onSetWatched).toHaveBeenCalledWith("v2", false);
  });

  it("renders emptyState and no queue when there are no items", () => {
    render(
      <FeedView
        items={[]}
        onSetWatched={vi.fn()}
        emptyState={<p>Nothing here</p>}
        storageKey=""
      />,
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Queue" })).not.toBeInTheDocument();
  });

  it("shows Load more only when hasMore and onLoadMore are both given", async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <FeedView
        items={[VIDEO_1]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey=""
        hasMore={false}
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();

    rerender(
      <FeedView
        items={[VIDEO_1]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey=""
        hasMore
      />,
    );

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();

    rerender(
      <FeedView
        items={[VIDEO_1]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey=""
        hasMore
        onLoadMore={onLoadMore}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("persists the selected video under storageKey when a queue row is clicked", async () => {
    const user = userEvent.setup();

    render(
      <FeedView
        items={[VIDEO_1, VIDEO_2]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey="test.selectedVideoId"
      />,
    );

    await screen.findAllByText("First Video");
    await user.click(screen.getByText("Second Video"));

    expect(window.localStorage.getItem("test.selectedVideoId")).toBe("v2");
  });

  it("restores the stored selection when it's still in items", async () => {
    window.localStorage.setItem("test.selectedVideoId", "v2");

    render(
      <FeedView
        items={[VIDEO_1, VIDEO_2]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey="test.selectedVideoId"
      />,
    );

    // selected title renders twice, see the prev/next test
    await waitFor(() => expect(screen.getAllByText("Second Video")).toHaveLength(2));
    expect(screen.getAllByText("First Video")).toHaveLength(1);
  });

  it("falls back to the first item when the stored selection is no longer in items", async () => {
    window.localStorage.setItem("test.selectedVideoId", "stale-id");

    render(
      <FeedView
        items={[VIDEO_1, VIDEO_2]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey="test.selectedVideoId"
      />,
    );

    await waitFor(() => expect(screen.getAllByText("First Video")).toHaveLength(2));
    expect(window.localStorage.getItem("test.selectedVideoId")).toBe("v1");
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
    // selected title renders twice, player and queue row, others once
    expect(screen.getAllByText("Second Video")).toHaveLength(2);
    expect(screen.getAllByText("First Video")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getAllByText("First Video")).toHaveLength(2);
    expect(screen.getAllByText("Second Video")).toHaveLength(1);
  });

  it("disables Previous on the first item", async () => {
    render(
      <FeedView
        items={[VIDEO_1, { ...VIDEO_2, is_watched: false }]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey=""
      />,
    );

    // same selection effect wait as the prev/next test above
    expect(await screen.findByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
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

  it("persists catch-up mode to localStorage when toggled", async () => {
    const user = userEvent.setup();

    render(
      <FeedView
        items={[VIDEO_1]}
        onSetWatched={vi.fn()}
        emptyState={<div />}
        storageKey=""
      />,
    );

    await user.click(await screen.findByLabelText(/catch-up mode/i));

    expect(window.localStorage.getItem("betterYtTv.catchUpMode")).toBe("false");
  });
});
