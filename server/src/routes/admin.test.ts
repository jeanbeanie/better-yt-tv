import express from "express";
import request from "supertest";
import { describe, it, expect, vi } from "vitest";

let mockIsAdmin = false;

vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = "test-user-id";
    req.isAdmin = mockIsAdmin;
    next();
  },
}));

vi.mock("../youtube/quota.js", () => ({
  getQuotaHistory: vi.fn(),
  summarizeToday: vi.fn(),
}));

const { getQuotaHistory, summarizeToday } = await import("../youtube/quota.js");
const { adminRouter } = await import("./admin.js");

function buildApp() {
  const app = express();
  app.use("/api/admin", adminRouter);
  return app;
}

describe("GET /api/admin/quota", () => {
  it("returns today's summary and history for an admin", async () => {
    mockIsAdmin = true;
    vi.mocked(getQuotaHistory).mockResolvedValue({
      days: [{ date: "2026-08-19", total: 5, breakdown: [{ callType: "playlistItems.list", units: 5 }] }],
      todayDate: "2026-08-19",
    });
    vi.mocked(summarizeToday).mockReturnValue({
      used: 5,
      remaining: 9995,
      budget: 10000,
      breakdown: [{ callType: "playlistItems.list", units: 5 }],
    });

    const res = await request(buildApp()).get("/api/admin/quota");

    expect(res.status).toBe(200);
    expect(res.body.today).toEqual({
      used: 5,
      remaining: 9995,
      budget: 10000,
      breakdown: [{ callType: "playlistItems.list", units: 5 }],
    });
    expect(res.body.history).toHaveLength(1);
  });

  it("403s for a non-admin session without calling getQuotaHistory", async () => {
    mockIsAdmin = false;
    vi.mocked(getQuotaHistory).mockReset();

    const res = await request(buildApp()).get("/api/admin/quota");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      code: "ADMIN_REQUIRED",
      message: "You are not authorized to view this page.",
    });
    expect(getQuotaHistory).not.toHaveBeenCalled();
  });
});
