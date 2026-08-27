import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import { describe, it, expect, vi } from "vitest";
import type { AuthedRequest } from "../auth/requireAuth.js";

let mockIsAdmin = false;

vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as AuthedRequest).userId = "test-user-id";
    (req as AuthedRequest).isAdmin = mockIsAdmin;
    next();
  },
}));

vi.mock("../youtube/quota.js", () => ({
  getQuotaHistory: vi.fn(),
  getQuotaGroupsOnDate: vi.fn(),
  getQuotaCallsInGroup: vi.fn(),
  summarizeToday: vi.fn(),
  YOUTUBE_QUOTA_CALL_TYPES: ["channels.list", "playlistItems.list", "subscriptions.list"],
}));

vi.mock("../settings/appSettings.js", () => ({
  getAppSettings: vi.fn(),
  setRefreshPaused: vi.fn(),
}));

vi.mock("../invites/invites.js", () => ({
  createInvite: vi.fn(),
  listInvites: vi.fn(),
  deleteInvite: vi.fn(),
  countUsers: vi.fn(),
}));

const { getQuotaHistory, getQuotaGroupsOnDate, getQuotaCallsInGroup, summarizeToday } =
  await import("../youtube/quota.js");
const { getAppSettings, setRefreshPaused } = await import("../settings/appSettings.js");
const { createInvite, listInvites, deleteInvite, countUsers } = await import(
  "../invites/invites.js"
);
const { adminRouter } = await import("./admin.js");

function buildApp() {
  const app = express();
  app.use(express.json());
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

describe("GET /api/admin/settings", () => {
  it("returns the current settings for an admin", async () => {
    mockIsAdmin = true;
    vi.mocked(getAppSettings).mockResolvedValue({
      refreshPaused: true,
      updatedAt: "2026-08-20T12:00:00.000Z",
      updatedBy: "user-1",
    });

    const res = await request(buildApp()).get("/api/admin/settings");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      refreshPaused: true,
      updatedAt: "2026-08-20T12:00:00.000Z",
      updatedBy: "user-1",
    });
  });

  it("403s for a non-admin session without calling getAppSettings", async () => {
    mockIsAdmin = false;
    vi.mocked(getAppSettings).mockReset();

    const res = await request(buildApp()).get("/api/admin/settings");

    expect(res.status).toBe(403);
    expect(getAppSettings).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/settings", () => {
  it("updates refreshPaused for an admin", async () => {
    mockIsAdmin = true;
    vi.mocked(setRefreshPaused).mockResolvedValue({
      refreshPaused: true,
      updatedAt: "2026-08-20T12:00:00.000Z",
      updatedBy: "test-user-id",
    });

    const res = await request(buildApp())
      .patch("/api/admin/settings")
      .send({ refreshPaused: true });

    expect(res.status).toBe(200);
    expect(setRefreshPaused).toHaveBeenCalledWith(true, "test-user-id");
    expect(res.body).toEqual({
      refreshPaused: true,
      updatedAt: "2026-08-20T12:00:00.000Z",
      updatedBy: "test-user-id",
    });
  });

  it("400s when refreshPaused is not a boolean", async () => {
    mockIsAdmin = true;
    vi.mocked(setRefreshPaused).mockReset();

    const res = await request(buildApp())
      .patch("/api/admin/settings")
      .send({ refreshPaused: "yes" });

    expect(res.status).toBe(400);
    expect(setRefreshPaused).not.toHaveBeenCalled();
  });

  it("400s when refreshPaused is missing", async () => {
    mockIsAdmin = true;
    vi.mocked(setRefreshPaused).mockReset();

    const res = await request(buildApp()).patch("/api/admin/settings").send({});

    expect(res.status).toBe(400);
    expect(setRefreshPaused).not.toHaveBeenCalled();
  });

  it("403s for a non-admin session without calling setRefreshPaused", async () => {
    mockIsAdmin = false;
    vi.mocked(setRefreshPaused).mockReset();

    const res = await request(buildApp())
      .patch("/api/admin/settings")
      .send({ refreshPaused: true });

    expect(res.status).toBe(403);
    expect(setRefreshPaused).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/invites", () => {
  it("returns the invite list alongside the user count for an admin", async () => {
    mockIsAdmin = true;
    vi.mocked(listInvites).mockResolvedValue([
      {
        code: "code-1",
        note: "for a friend",
        createdAt: "2026-08-20T00:00:00.000Z",
        usedAt: null,
        usedByEmail: null,
      },
    ]);
    vi.mocked(countUsers).mockResolvedValue(37);

    const res = await request(buildApp()).get("/api/admin/invites");

    expect(res.status).toBe(200);
    expect(res.body.usersCount).toBe(37);
    expect(res.body.invites).toHaveLength(1);
  });

  it("403s for a non-admin session without calling listInvites", async () => {
    mockIsAdmin = false;
    vi.mocked(listInvites).mockReset();

    const res = await request(buildApp()).get("/api/admin/invites");

    expect(res.status).toBe(403);
    expect(listInvites).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/invites", () => {
  it("creates an invite with the acting admin's id", async () => {
    mockIsAdmin = true;
    vi.mocked(createInvite).mockResolvedValue({
      code: "new-code",
      note: "for a friend",
      createdAt: "2026-08-23T00:00:00.000Z",
      usedAt: null,
      usedByEmail: null,
    });

    const res = await request(buildApp())
      .post("/api/admin/invites")
      .send({ note: "for a friend" });

    expect(res.status).toBe(200);
    expect(createInvite).toHaveBeenCalledWith("for a friend", "test-user-id");
    expect(res.body.code).toBe("new-code");
  });

  it("creates an invite with no note when none is given", async () => {
    mockIsAdmin = true;
    vi.mocked(createInvite).mockResolvedValue({
      code: "new-code",
      note: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      usedAt: null,
      usedByEmail: null,
    });

    const res = await request(buildApp()).post("/api/admin/invites").send({});

    expect(res.status).toBe(200);
    expect(createInvite).toHaveBeenCalledWith(null, "test-user-id");
  });

  it("400s when note is not a string or null", async () => {
    mockIsAdmin = true;
    vi.mocked(createInvite).mockReset();

    const res = await request(buildApp()).post("/api/admin/invites").send({ note: 5 });

    expect(res.status).toBe(400);
    expect(createInvite).not.toHaveBeenCalled();
  });

  it("403s for a non-admin session without calling createInvite", async () => {
    mockIsAdmin = false;
    vi.mocked(createInvite).mockReset();

    const res = await request(buildApp()).post("/api/admin/invites").send({});

    expect(res.status).toBe(403);
    expect(createInvite).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/invites/:code", () => {
  it("deletes an unused code for an admin", async () => {
    mockIsAdmin = true;
    vi.mocked(deleteInvite).mockResolvedValue(true);

    const res = await request(buildApp()).delete("/api/admin/invites/code-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(deleteInvite).toHaveBeenCalledWith("code-1");
  });

  it("404s when the code is already used or doesn't exist", async () => {
    mockIsAdmin = true;
    vi.mocked(deleteInvite).mockResolvedValue(false);

    const res = await request(buildApp()).delete("/api/admin/invites/code-1");

    expect(res.status).toBe(404);
  });

  it("403s for a non-admin session without calling deleteInvite", async () => {
    mockIsAdmin = false;
    vi.mocked(deleteInvite).mockReset();

    const res = await request(buildApp()).delete("/api/admin/invites/code-1");

    expect(res.status).toBe(403);
    expect(deleteInvite).not.toHaveBeenCalled();
  });
});
