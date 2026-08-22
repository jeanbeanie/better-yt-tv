import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AdminPage from "./AdminPage";
import {
  getQuotaSummary,
  getQuotaGroupsForDate,
  getQuotaGroupCalls,
  getAppSettings,
  updateAppSettings,
  ApiError,
} from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    getQuotaSummary: vi.fn(),
    getQuotaGroupsForDate: vi.fn(),
    getQuotaGroupCalls: vi.fn(),
    getAppSettings: vi.fn(),
    updateAppSettings: vi.fn(),
    getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
  };
});

const HISTORY_RESPONSE = {
  today: {
    used: 250,
    remaining: 9750,
    budget: 10000,
    breakdown: [{ callType: "playlistItems.list", units: 250 }],
  },
  history: [
    {
      date: "2026-08-19",
      total: 250,
      breakdown: [{ callType: "playlistItems.list", units: 250 }],
    },
  ],
};

describe("AdminPage", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.mocked(getQuotaSummary).mockReset();
    vi.mocked(getQuotaGroupsForDate).mockReset();
    vi.mocked(getQuotaGroupCalls).mockReset();
    vi.mocked(getAppSettings).mockReset();
    vi.mocked(updateAppSettings).mockReset();
    vi.mocked(getAppSettings).mockResolvedValue({
      refreshPaused: false,
      updatedAt: "2026-08-21T00:00:00.000Z",
      updatedBy: null,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("renders today's summary, breakdown, and history", async () => {
    vi.mocked(getQuotaSummary).mockResolvedValue({
      today: {
        used: 250,
        remaining: 9750,
        budget: 10000,
        breakdown: [{ callType: "playlistItems.list", units: 250 }],
      },
      history: [
        {
          date: "2026-08-19",
          total: 250,
          breakdown: [{ callType: "playlistItems.list", units: 250 }],
        },
      ],
    });

    render(<AdminPage />);

    expect(await screen.findByText(/250 estimated used today/i)).toBeInTheDocument();
    expect(screen.getByText(/9,750 estimated remaining/i)).toBeInTheDocument();
    expect(screen.getAllByText("playlistItems.list").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2026-08-19")).toBeInTheDocument();
  });

  it("shows a not-authorized state on 403 ADMIN_REQUIRED, without partial data", async () => {
    vi.mocked(getQuotaSummary).mockRejectedValue(
      new ApiError("You are not authorized to view this page.", 403, "ADMIN_REQUIRED"),
    );

    render(<AdminPage />);

    expect(await screen.findByText(/not authorized to view this page/i)).toBeInTheDocument();
    expect(screen.queryByText(/estimated used today/i)).not.toBeInTheDocument();
  });

  it("shows a redirecting message on 401 AUTH_REQUIRED", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: vi.fn() },
    });

    vi.mocked(getQuotaSummary).mockRejectedValue(
      new ApiError("Your session is no longer valid.", 401, "AUTH_REQUIRED"),
    );

    render(<AdminPage />);

    expect(await screen.findByText(/session expired/i)).toBeInTheDocument();
  });

  it("keeps quota groups collapsed by default", async () => {
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);

    render(<AdminPage />);

    expect(await screen.findByText("2026-08-19")).toBeInTheDocument();
    expect(getQuotaGroupsForDate).not.toHaveBeenCalled();
    expect(screen.getByTitle("Expand")).toBeInTheDocument();
    expect(screen.queryByTitle("Collapse")).not.toBeInTheDocument();
  });

  it("expands a day's caret to lazy-load and show one line per group, with no caret on an identified group", async () => {
    const user = userEvent.setup();
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);
    vi.mocked(getQuotaGroupsForDate).mockResolvedValue({
      date: "2026-08-19",
      groups: [
        {
          action: "refresh-all-cache",
          callType: "playlistItems.list",
          units: 800,
          requestGroupId: "rg-1",
          userEmail: "you@x.com",
          firstAt: "2026-08-19T20:00:00.000Z",
          lastAt: "2026-08-19T20:05:00.000Z",
        },
      ],
    });

    render(<AdminPage />);
    await screen.findByText("2026-08-19");

    const dayCaret = screen.getByTitle("Expand");
    expect(dayCaret).toHaveAttribute("aria-expanded", "false");

    await user.click(dayCaret);

    expect(getQuotaGroupsForDate).toHaveBeenCalledWith("2026-08-19");
    expect(await screen.findByText("refresh-all-cache")).toBeInTheDocument();
    expect(screen.getByText("you@x.com")).toBeInTheDocument();
    expect(screen.getByText("800 units")).toBeInTheDocument();

    // an identified group has no drill-down, so only the day caret exists
    expect(screen.getAllByTitle(/Expand|Collapse/)).toHaveLength(1);
  });

  it("renders two lines when two groups share action and call type but differ by user", async () => {
    const user = userEvent.setup();
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);
    vi.mocked(getQuotaGroupsForDate).mockResolvedValue({
      date: "2026-08-19",
      groups: [
        {
          action: "sync-subscriptions",
          callType: "subscriptions.list",
          units: 5,
          requestGroupId: "rg-a",
          userEmail: "a@x.com",
          firstAt: "2026-08-19T19:00:00.000Z",
          lastAt: "2026-08-19T19:00:00.000Z",
        },
        {
          action: "sync-subscriptions",
          callType: "subscriptions.list",
          units: 5,
          requestGroupId: "rg-b",
          userEmail: "b@x.com",
          firstAt: "2026-08-19T19:10:00.000Z",
          lastAt: "2026-08-19T19:10:00.000Z",
        },
      ],
    });

    render(<AdminPage />);
    await screen.findByText("2026-08-19");
    await user.click(screen.getByTitle("Expand"));

    expect(await screen.findByText("a@x.com")).toBeInTheDocument();
    expect(screen.getByText("b@x.com")).toBeInTheDocument();
    expect(screen.getAllByText("sync-subscriptions")).toHaveLength(2);
  });

  it("shows an unidentified group as 'unknown (before tracking)' with a caret, and drills into raw calls", async () => {
    const user = userEvent.setup();
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);
    vi.mocked(getQuotaGroupsForDate).mockResolvedValue({
      date: "2026-08-19",
      groups: [
        {
          action: null,
          callType: "channels.list",
          units: 10,
          requestGroupId: null,
          userEmail: null,
          firstAt: "2026-08-19T19:00:00.000Z",
          lastAt: "2026-08-19T19:00:00.000Z",
        },
      ],
    });
    vi.mocked(getQuotaGroupCalls).mockResolvedValue({
      date: "2026-08-19",
      calls: [{ calledAt: "2026-08-19T19:00:00.000Z", callType: "channels.list", units: 1 }],
    });

    render(<AdminPage />);
    await screen.findByText("2026-08-19");

    await user.click(screen.getByTitle("Expand"));
    expect(await screen.findByText("unknown (before tracking)")).toBeInTheDocument();

    // day caret is now "Collapse", so the remaining "Expand" caret belongs to the group
    const groupCaret = screen.getByTitle("Expand");
    expect(groupCaret).toHaveAttribute("aria-expanded", "false");

    await user.click(groupCaret);

    expect(getQuotaGroupCalls).toHaveBeenCalledWith({
      date: "2026-08-19",
      callType: "channels.list",
      action: null,
      userId: null,
      requestGroupId: null,
    });
    expect(await screen.findByText("1 units")).toBeInTheDocument();

    const collapseCarets = screen.getAllByTitle("Collapse");
    expect(collapseCarets).toHaveLength(2);
    expect(collapseCarets[1]).toHaveAttribute("aria-expanded", "true");

    await user.click(collapseCarets[1]);

    expect(screen.queryByText("1 units")).not.toBeInTheDocument();
    expect(screen.getByTitle("Expand")).toHaveAttribute("aria-expanded", "false");
  });

  it("reuses cached groups and calls on re-expand, without refetching", async () => {
    const user = userEvent.setup();
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);
    vi.mocked(getQuotaGroupsForDate).mockResolvedValue({
      date: "2026-08-19",
      groups: [
        {
          action: null,
          callType: "channels.list",
          units: 10,
          requestGroupId: null,
          userEmail: null,
          firstAt: "2026-08-19T19:00:00.000Z",
          lastAt: "2026-08-19T19:00:00.000Z",
        },
      ],
    });
    vi.mocked(getQuotaGroupCalls).mockResolvedValue({
      date: "2026-08-19",
      calls: [{ calledAt: "2026-08-19T19:00:00.000Z", callType: "channels.list", units: 1 }],
    });

    render(<AdminPage />);
    await screen.findByText("2026-08-19");

    await user.click(screen.getByTitle("Expand"));
    await user.click(await screen.findByTitle("Expand"));
    expect(await screen.findByText("1 units")).toBeInTheDocument();

    // collapse both levels, then re-expand both: neither fetch should re-fire
    const collapseCarets = screen.getAllByTitle("Collapse");
    await user.click(collapseCarets[1]);
    await user.click(collapseCarets[0]);

    await user.click(screen.getByTitle("Expand"));
    await user.click(await screen.findByTitle("Expand"));

    expect(await screen.findByText("1 units")).toBeInTheDocument();
    expect(getQuotaGroupsForDate).toHaveBeenCalledTimes(1);
    expect(getQuotaGroupCalls).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed fetch, so collapsing and re-expanding retries it", async () => {
    const user = userEvent.setup();
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);
    vi.mocked(getQuotaGroupsForDate)
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({
        date: "2026-08-19",
        groups: [
          {
            action: "refresh-all-cache",
            callType: "playlistItems.list",
            units: 80,
            requestGroupId: "rg-1",
            userEmail: "you@x.com",
            firstAt: "2026-08-19T20:00:00.000Z",
            lastAt: "2026-08-19T20:00:00.000Z",
          },
        ],
      });

    render(<AdminPage />);
    await screen.findByText("2026-08-19");

    await user.click(screen.getByTitle("Expand"));

    expect(await screen.findByText("network blip")).toBeInTheDocument();

    await user.click(screen.getByTitle("Collapse"));
    await user.click(screen.getByTitle("Expand"));

    expect(await screen.findByText("80 units")).toBeInTheDocument();
    expect(screen.queryByText("network blip")).not.toBeInTheDocument();
    expect(getQuotaGroupsForDate).toHaveBeenCalledTimes(2);
  });

  it("shows the current refresh-pause state from getAppSettings", async () => {
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);
    vi.mocked(getAppSettings).mockResolvedValue({
      refreshPaused: true,
      updatedAt: "2026-08-21T00:00:00.000Z",
      updatedBy: "admin-user-id",
    });

    render(<AdminPage />);

    expect(await screen.findByText(/paused/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  it("clicking the toggle calls updateAppSettings with the flipped value and reflects the result", async () => {
    const user = userEvent.setup();
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);
    vi.mocked(getAppSettings).mockResolvedValue({
      refreshPaused: false,
      updatedAt: "2026-08-21T00:00:00.000Z",
      updatedBy: null,
    });
    vi.mocked(updateAppSettings).mockResolvedValue({
      refreshPaused: true,
      updatedAt: "2026-08-21T01:00:00.000Z",
      updatedBy: "admin-user-id",
    });

    render(<AdminPage />);
    const toggleButton = await screen.findByRole("button", { name: "Pause" });

    await user.click(toggleButton);

    expect(updateAppSettings).toHaveBeenCalledWith({ refreshPaused: true });
    expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
  });
});
