import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

vi.mock("./quota.js", () => ({
  recordQuotaUsage: vi.fn(),
}));

const { recordQuotaUsage } = await import("./quota.js");
const { fetchRecentVideosForChannel } = await import("./videos.js");

function mockChannelAndPlaylistFetch(opts: {
  channelStatus?: number;
  playlistStatus?: number;
}) {
  const channelStatus = opts.channelStatus ?? 200;
  const playlistStatus = opts.playlistStatus ?? 200;

  global.fetch = vi
    .fn()
    .mockImplementationOnce(async () =>
      channelStatus === 200
        ? new Response(
            JSON.stringify({
              items: [{ contentDetails: { relatedPlaylists: { uploads: "uploads-playlist-id" } } }],
            }),
            { status: 200 },
          )
        : new Response("nope", { status: channelStatus }),
    )
    .mockImplementationOnce(async () =>
      playlistStatus === 200
        ? new Response(JSON.stringify({ items: [] }), { status: 200 })
        : new Response("nope", { status: playlistStatus }),
    ) as unknown as typeof fetch;
}

describe("fetchRecentVideosForChannel", () => {
  beforeEach(() => {
    vi.mocked(recordQuotaUsage).mockReset();
  });

  it("records one unit for channels.list and one for playlistItems.list", async () => {
    mockChannelAndPlaylistFetch({});

    await fetchRecentVideosForChannel({ accessToken: "token", channelId: "chan1" });

    expect(recordQuotaUsage).toHaveBeenCalledWith("channels.list", 1);
    expect(recordQuotaUsage).toHaveBeenCalledWith("playlistItems.list", 1);
    expect(recordQuotaUsage).toHaveBeenCalledTimes(2);
  });

  it("still records channels.list usage when the channel lookup fails", async () => {
    mockChannelAndPlaylistFetch({ channelStatus: 403 });

    await expect(
      fetchRecentVideosForChannel({ accessToken: "token", channelId: "chan1" }),
    ).rejects.toThrow();

    expect(recordQuotaUsage).toHaveBeenCalledWith("channels.list", 1);
    expect(recordQuotaUsage).not.toHaveBeenCalledWith("playlistItems.list", 1);
  });

  it("still records playlistItems.list usage when the playlist fetch fails", async () => {
    mockChannelAndPlaylistFetch({ playlistStatus: 500 });

    await expect(
      fetchRecentVideosForChannel({ accessToken: "token", channelId: "chan1" }),
    ).rejects.toThrow();

    expect(recordQuotaUsage).toHaveBeenCalledWith("channels.list", 1);
    expect(recordQuotaUsage).toHaveBeenCalledWith("playlistItems.list", 1);
  });
});
