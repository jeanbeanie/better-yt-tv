import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AdminPage from "./AdminPage";
import { getQuotaSummary, getQuotaCallsForDate, ApiError } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    getQuotaSummary: vi.fn(),
    getQuotaCallsForDate: vi.fn(),
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
    vi.mocked(getQuotaCallsForDate).mockReset();
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

  it("keeps call detail rows collapsed by default", async () => {
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);

    render(<AdminPage />);

    expect(await screen.findByText("2026-08-19")).toBeInTheDocument();
    expect(getQuotaCallsForDate).not.toHaveBeenCalled();
    expect(screen.getByTitle("Expand")).toBeInTheDocument();
    expect(screen.queryByTitle("Collapse")).not.toBeInTheDocument();
  });

  it("expands a day's caret to lazy-load and show individual calls, then collapses", async () => {
    const user = userEvent.setup();
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);
    vi.mocked(getQuotaCallsForDate).mockResolvedValue({
      date: "2026-08-19",
      calls: [{ calledAt: "2026-08-19T20:00:00.000Z", callType: "playlistItems.list", units: 80 }],
    });

    render(<AdminPage />);
    await screen.findByText("2026-08-19");

    const caret = screen.getByTitle("Expand");
    expect(caret).toHaveAttribute("aria-expanded", "false");

    await user.click(caret);

    expect(getQuotaCallsForDate).toHaveBeenCalledWith("2026-08-19");
    expect(await screen.findByText("80 units")).toBeInTheDocument();
    const collapseCaret = screen.getByTitle("Collapse");
    expect(collapseCaret).toHaveAttribute("aria-expanded", "true");

    await user.click(collapseCaret);

    expect(screen.queryByText("80 units")).not.toBeInTheDocument();
    expect(screen.getByTitle("Expand")).toHaveAttribute("aria-expanded", "false");

    // re-expanding a successfully-loaded day reuses the cache, no refetch
    await user.click(screen.getByTitle("Expand"));

    expect(await screen.findByText("80 units")).toBeInTheDocument();
    expect(getQuotaCallsForDate).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed fetch, so collapsing and re-expanding retries it", async () => {
    const user = userEvent.setup();
    vi.mocked(getQuotaSummary).mockResolvedValue(HISTORY_RESPONSE);
    vi.mocked(getQuotaCallsForDate)
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({
        date: "2026-08-19",
        calls: [{ calledAt: "2026-08-19T20:00:00.000Z", callType: "playlistItems.list", units: 80 }],
      });

    render(<AdminPage />);
    await screen.findByText("2026-08-19");

    await user.click(screen.getByTitle("Expand"));

    expect(await screen.findByText("network blip")).toBeInTheDocument();

    await user.click(screen.getByTitle("Collapse"));
    await user.click(screen.getByTitle("Expand"));

    expect(await screen.findByText("80 units")).toBeInTheDocument();
    expect(screen.queryByText("network blip")).not.toBeInTheDocument();
    expect(getQuotaCallsForDate).toHaveBeenCalledTimes(2);
  });
});
