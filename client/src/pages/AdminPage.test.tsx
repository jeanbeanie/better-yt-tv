import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AdminPage from "./AdminPage";
import { getQuotaSummary, ApiError } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    getQuotaSummary: vi.fn(),
    getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login"),
  };
});

describe("AdminPage", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.mocked(getQuotaSummary).mockReset();
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
});
