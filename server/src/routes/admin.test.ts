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
  getQuotaCallsOnDate: vi.fn(),
  getQuotaGroupsOnDate: vi.fn(),
  getQuotaCallsInGroup: vi.fn(),
  summarizeToday: vi.fn(),
  YOUTUBE_QUOTA_CALL_TYPES: ["channels.list", "playlistItems.list", "subscriptions.list"],
}));

const {
  getQuotaHistory,
  getQuotaCallsOnDate,
  getQuotaGroupsOnDate,
  getQuotaCallsInGroup,
  summarizeToday,
} = await import("../youtube/quota.js");
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

describe("GET /api/admin/quota/calls", () => {
  it("returns the day's calls for an admin", async () => {
    mockIsAdmin = true;
    vi.mocked(getQuotaCallsOnDate).mockResolvedValue([
      { calledAt: "2026-08-17T20:00:00.000Z", callType: "channels.list", units: 1 },
    ]);

    const res = await request(buildApp()).get("/api/admin/quota/calls?date=2026-08-17");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date: "2026-08-17",
      calls: [{ calledAt: "2026-08-17T20:00:00.000Z", callType: "channels.list", units: 1 }],
    });
    expect(getQuotaCallsOnDate).toHaveBeenCalledWith("2026-08-17");
  });

  it("400s when date is missing", async () => {
    mockIsAdmin = true;
    vi.mocked(getQuotaCallsOnDate).mockReset();

    const res = await request(buildApp()).get("/api/admin/quota/calls");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "date must be a valid YYYY-MM-DD date" });
    expect(getQuotaCallsOnDate).not.toHaveBeenCalled();
  });

  it.each(["2026-8-17", "2026-08-32", "not-a-date", "2026-02-30"])(
    "400s for a malformed date %s",
    async (date) => {
      mockIsAdmin = true;
      vi.mocked(getQuotaCallsOnDate).mockReset();

      const res = await request(buildApp()).get(`/api/admin/quota/calls?date=${date}`);

      expect(res.status).toBe(400);
      expect(getQuotaCallsOnDate).not.toHaveBeenCalled();
    },
  );

  it("403s for a non-admin session without calling getQuotaCallsOnDate", async () => {
    mockIsAdmin = false;
    vi.mocked(getQuotaCallsOnDate).mockReset();

    const res = await request(buildApp()).get("/api/admin/quota/calls?date=2026-08-17");

    expect(res.status).toBe(403);
    expect(getQuotaCallsOnDate).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/quota/groups", () => {
  it("returns the day's groups for an admin", async () => {
    mockIsAdmin = true;
    vi.mocked(getQuotaGroupsOnDate).mockResolvedValue([
      {
        action: "refresh-all-cache",
        callType: "playlistItems.list",
        units: 900,
        requestGroupId: "group-a",
        userEmail: "one@example.com",
        firstAt: "2026-08-17T18:00:00.000Z",
        lastAt: "2026-08-17T18:05:00.000Z",
      },
    ]);

    const res = await request(buildApp()).get("/api/admin/quota/groups?date=2026-08-17");

    expect(res.status).toBe(200);
    expect(res.body.date).toBe("2026-08-17");
    expect(res.body.groups).toHaveLength(1);
    expect(getQuotaGroupsOnDate).toHaveBeenCalledWith("2026-08-17");
  });

  it("400s on a missing or malformed date", async () => {
    mockIsAdmin = true;
    vi.mocked(getQuotaGroupsOnDate).mockReset();

    const res = await request(buildApp()).get("/api/admin/quota/groups?date=2026-02-30");

    expect(res.status).toBe(400);
    expect(getQuotaGroupsOnDate).not.toHaveBeenCalled();
  });

  it("403s for a non-admin session without calling getQuotaGroupsOnDate", async () => {
    mockIsAdmin = false;
    vi.mocked(getQuotaGroupsOnDate).mockReset();

    const res = await request(buildApp()).get("/api/admin/quota/groups?date=2026-08-17");

    expect(res.status).toBe(403);
    expect(getQuotaGroupsOnDate).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/quota/group-calls", () => {
  it("returns calls for a fully specified group", async () => {
    mockIsAdmin = true;
    vi.mocked(getQuotaCallsInGroup).mockResolvedValue([
      { calledAt: "2026-08-17T18:00:00.000Z", callType: "playlistItems.list", units: 100 },
    ]);

    const res = await request(buildApp()).get(
      "/api/admin/quota/group-calls?date=2026-08-17&callType=playlistItems.list&action=refresh-all-cache&userId=user-1&requestGroupId=group-a",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date: "2026-08-17",
      calls: [{ calledAt: "2026-08-17T18:00:00.000Z", callType: "playlistItems.list", units: 100 }],
    });
    expect(getQuotaCallsInGroup).toHaveBeenCalledWith({
      date: "2026-08-17",
      callType: "playlistItems.list",
      action: "refresh-all-cache",
      userId: "user-1",
      requestGroupId: "group-a",
    });
  });

  it("treats absent action, userId, and requestGroupId as null", async () => {
    mockIsAdmin = true;
    vi.mocked(getQuotaCallsInGroup).mockResolvedValue([]);

    const res = await request(buildApp()).get(
      "/api/admin/quota/group-calls?date=2026-08-17&callType=channels.list",
    );

    expect(res.status).toBe(200);
    expect(getQuotaCallsInGroup).toHaveBeenCalledWith({
      date: "2026-08-17",
      callType: "channels.list",
      action: null,
      userId: null,
      requestGroupId: null,
    });
  });

  it("400s on a missing or malformed date", async () => {
    mockIsAdmin = true;
    vi.mocked(getQuotaCallsInGroup).mockReset();

    const res = await request(buildApp()).get(
      "/api/admin/quota/group-calls?date=2026-02-30&callType=channels.list",
    );

    expect(res.status).toBe(400);
    expect(getQuotaCallsInGroup).not.toHaveBeenCalled();
  });

  it("400s on a callType outside YOUTUBE_QUOTA_CALL_TYPES", async () => {
    mockIsAdmin = true;
    vi.mocked(getQuotaCallsInGroup).mockReset();

    const res = await request(buildApp()).get(
      "/api/admin/quota/group-calls?date=2026-08-17&callType=videos.list",
    );

    expect(res.status).toBe(400);
    expect(getQuotaCallsInGroup).not.toHaveBeenCalled();
  });

  it("400s when callType is missing", async () => {
    mockIsAdmin = true;
    vi.mocked(getQuotaCallsInGroup).mockReset();

    const res = await request(buildApp()).get("/api/admin/quota/group-calls?date=2026-08-17");

    expect(res.status).toBe(400);
    expect(getQuotaCallsInGroup).not.toHaveBeenCalled();
  });

  it("403s for a non-admin session without calling getQuotaCallsInGroup", async () => {
    mockIsAdmin = false;
    vi.mocked(getQuotaCallsInGroup).mockReset();

    const res = await request(buildApp()).get(
      "/api/admin/quota/group-calls?date=2026-08-17&callType=channels.list",
    );

    expect(res.status).toBe(403);
    expect(getQuotaCallsInGroup).not.toHaveBeenCalled();
  });
});
