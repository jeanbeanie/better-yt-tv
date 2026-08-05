import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChannelsSettingsPage from "./ChannelsSettingsPage";
import { getChannels } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  getChannels: vi.fn(),
  updateChannel: vi.fn(),
  bulkUpdateChannels: vi.fn(),
  refreshAllCache: vi.fn(),
  syncSubscriptions: vi.fn(),
}));

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

// 35 generic channels plus one distinctly-named one, to exercise both
// pagination (35 > PAGE_SIZE of 30) and "search finds something far down
// the list" (the actual scenario this feature is for)
const MANY_CHANNELS = [
  ...Array.from({ length: 35 }, (_, i) => makeChannel(i + 1, `Channel ${String(i + 1).padStart(2, "0")}`)),
  makeChannel(999, "Zebra Exclusive"),
];

describe("ChannelsSettingsPage", () => {
  beforeEach(() => {
    vi.mocked(getChannels).mockReset();
  });

  it("renders only the first page of channels initially, with a count indicator", async () => {
    vi.mocked(getChannels).mockResolvedValue({ channels: MANY_CHANNELS });

    render(<ChannelsSettingsPage />);

    await screen.findByText("Channel 01");
    expect(screen.getByText("Showing 30 of 36 channels")).toBeInTheDocument();
    expect(screen.queryByText("Channel 35")).not.toBeInTheDocument();
    expect(screen.queryByText("Zebra Exclusive")).not.toBeInTheDocument();
  });

  it("reveals more channels when Load more is clicked", async () => {
    vi.mocked(getChannels).mockResolvedValue({ channels: MANY_CHANNELS });

    const user = userEvent.setup();
    render(<ChannelsSettingsPage />);

    await screen.findByText("Channel 01");
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Zebra Exclusive")).toBeInTheDocument();
    expect(screen.getByText("Showing 36 of 36 channels")).toBeInTheDocument();
    // all revealed, so the button should be gone
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("filters by search text and resets back to the first page", async () => {
    vi.mocked(getChannels).mockResolvedValue({ channels: MANY_CHANNELS });

    const user = userEvent.setup();
    render(<ChannelsSettingsPage />);

    await screen.findByText("Channel 01");

    // search narrows straight to a channel that would otherwise require
    // clicking "Load more" to reach
    await user.type(screen.getByPlaceholderText("Search your channels"), "Zebra");

    expect(await screen.findByText("Zebra Exclusive")).toBeInTheDocument();
    expect(screen.queryByText("Channel 01")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 1 matching channels")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows a distinct empty state when the search matches nothing", async () => {
    vi.mocked(getChannels).mockResolvedValue({ channels: MANY_CHANNELS });

    const user = userEvent.setup();
    render(<ChannelsSettingsPage />);

    await screen.findByText("Channel 01");
    await user.type(screen.getByPlaceholderText("Search your channels"), "nonexistent-xyz");

    expect(await screen.findByText("No channels match your search.")).toBeInTheDocument();
    expect(screen.queryByText("No synced channels yet. Sync subscriptions first.")).not.toBeInTheDocument();
  });

  it("shows the no-synced-channels state when there are no channels at all", async () => {
    vi.mocked(getChannels).mockResolvedValue({ channels: [] });

    render(<ChannelsSettingsPage />);

    expect(
      await screen.findByText("No synced channels yet. Sync subscriptions first."),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search your channels")).not.toBeInTheDocument();
  });
});
