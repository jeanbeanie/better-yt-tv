import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { asPoolClient, createMockPool, mockedConnect } from "../testUtils/pgMocks.js";
import type { AuthedRequest } from "../auth/requireAuth.js";

vi.mock("../db/pool.js", () => ({
  pool: createMockPool(),
}));

const { pool } = await import("../db/pool.js");
const { withYoutubeReauthHandling } = await import("./youtubeAuthGuard.js");

function buildApp(handler: (req: express.Request) => Promise<unknown>) {
  const app = express();
  app.use(cookieParser());
  app.post(
    "/test",
    (req, _res, next) => {
      // requireAuth normally attaches this before the handler runs
      (req as AuthedRequest).userId = "test-user-id";
      next();
    },
    withYoutubeReauthHandling(async (req) => handler(req)),
  );
  return app;
}

function fakeClient() {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() };
}

describe("withYoutubeReauthHandling cleanup transaction", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(pool.connect).mockReset();
  });

  it("commits both writes when they succeed", async () => {
    const client = fakeClient();
    mockedConnect(vi.mocked(pool.connect)).mockResolvedValue(asPoolClient(client));

    const app = buildApp(async () => {
      throw new Error("invalid_grant: token revoked");
    });

    const res = await request(app).post("/test").set("Cookie", "sid=fake-session-id");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      code: "YOUTUBE_REAUTH_REQUIRED",
      message: "Your YouTube connection expired. Please sign in again.",
    });

    const calls = client.query.mock.calls;
    expect(calls[0][0]).toBe("BEGIN");
    expect(calls[1][0]).toContain("delete from oauth_tokens");
    expect(calls[1][1]).toEqual(["test-user-id"]);
    expect(calls[2][0]).toContain("update sessions");
    expect(calls[2][1]).toEqual(["fake-session-id"]);
    expect(calls[3][0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("skips the session update when there is no sid cookie", async () => {
    const client = fakeClient();
    mockedConnect(vi.mocked(pool.connect)).mockResolvedValue(asPoolClient(client));

    const app = buildApp(async () => {
      throw new Error("invalid_grant: token revoked");
    });

    const res = await request(app).post("/test");

    expect(res.status).toBe(401);

    const calls = client.query.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][0]).toBe("BEGIN");
    expect(calls[1][0]).toContain("delete from oauth_tokens");
    expect(calls[2][0]).toBe("COMMIT");
  });

  it("rolls back instead of leaving the delete applied without the revoke", async () => {
    const client = fakeClient();
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes("update sessions")) {
        throw new Error("connection reset");
      }
      return { rows: [], rowCount: 0 };
    });
    mockedConnect(vi.mocked(pool.connect)).mockResolvedValue(asPoolClient(client));

    const app = buildApp(async () => {
      throw new Error("invalid_grant: token revoked");
    });

    const res = await request(app).post("/test").set("Cookie", "sid=fake-session-id");

    // Outer swallow-and-log behavior is unchanged: still 401 even though
    // cleanup itself failed and rolled back
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("YOUTUBE_REAUTH_REQUIRED");

    const sqlCalls = client.query.mock.calls.map((call) => call[0]);
    expect(sqlCalls).toContain("ROLLBACK");
    expect(sqlCalls).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
