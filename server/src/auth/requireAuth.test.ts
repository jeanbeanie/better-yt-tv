import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

const { pool } = await import("../db/pool.js");
const { requireAuth } = await import("./requireAuth.js");

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.get("/test", requireAuth, (req: any, res) => {
    res.json({ userId: req.userId, sessionId: req.sessionId, isAdmin: req.isAdmin });
  });
  return app;
}

describe("requireAuth", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("401s with no sid cookie, without querying the db", async () => {
    const res = await request(buildApp()).get("/test");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      code: "AUTH_REQUIRED",
      message: "You must be signed in to continue.",
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("attaches userId, sessionId, and isAdmin from the joined row", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ user_id: "user-1", is_admin: true }],
      rowCount: 1,
    } as any);

    const res = await request(buildApp()).get("/test").set("Cookie", "sid=fake-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "user-1", sessionId: "fake-session", isAdmin: true });
  });

  it("attaches isAdmin: false for a non-admin row", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ user_id: "user-1", is_admin: false }],
      rowCount: 1,
    } as any);

    const res = await request(buildApp()).get("/test").set("Cookie", "sid=fake-session");

    expect(res.body.isAdmin).toBe(false);
  });

  it("401s and clears the cookie when the session/user join returns no rows", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);

    const res = await request(buildApp()).get("/test").set("Cookie", "sid=stale-session");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_REQUIRED");
    expect(res.headers["set-cookie"]?.[0]).toContain("sid=;");
  });
});
