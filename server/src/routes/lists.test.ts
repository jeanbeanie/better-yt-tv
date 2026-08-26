import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPool, mockedQuery, mockQueryResult } from "../testUtils/pgMocks.js";
import type { AuthedRequest } from "../auth/requireAuth.js";

vi.mock("../db/pool.js", () => ({
  pool: createMockPool(),
}));

let mockAuthPasses = true;

vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (!mockAuthPasses) {
      return res.status(401).json({ code: "AUTH_REQUIRED", message: "Not signed in" });
    }
    (req as AuthedRequest).userId = "test-user-id";
    next();
  },
}));

const { pool } = await import("../db/pool.js");
const { listsRouter } = await import("./lists.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/lists", listsRouter);
  return app;
}

const VALID_LIST_ID = "11111111-1111-1111-1111-111111111111";
const MALFORMED_LIST_ID = "not-a-uuid";

// listId format must be checked after requireAuth in every handler, not via
// router.param() (that runs before route middleware, so a malformed id
// would 404 without ever checking auth)
describe("listId auth-before-validation ordering", () => {
  beforeEach(() => {
    mockAuthPasses = true;
    vi.mocked(pool.query).mockReset();
  });

  describe("GET /api/lists/:listId", () => {
    it("401s a malformed listId without touching the database, when unauthenticated", async () => {
      mockAuthPasses = false;

      const res = await request(buildApp()).get(`/api/lists/${MALFORMED_LIST_ID}`);

      expect(res.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("404s a malformed listId once authenticated", async () => {
      const res = await request(buildApp()).get(`/api/lists/${MALFORMED_LIST_ID}`);

      expect(res.status).toBe(404);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("404s a well-formed but nonexistent listId once authenticated", async () => {
      mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
        mockQueryResult({ rows: [], rowCount: 0 }),
      );

      const res = await request(buildApp()).get(`/api/lists/${VALID_LIST_ID}`);

      expect(res.status).toBe(404);
      expect(pool.query).toHaveBeenCalled();
    });
  });

  describe("PUT /api/lists/:listId", () => {
    it("401s a malformed listId without touching the database, when unauthenticated", async () => {
      mockAuthPasses = false;

      const res = await request(buildApp())
        .put(`/api/lists/${MALFORMED_LIST_ID}`)
        .send({ name: "New name", channelIds: [] });

      expect(res.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it("404s a malformed listId once authenticated", async () => {
      const res = await request(buildApp())
        .put(`/api/lists/${MALFORMED_LIST_ID}`)
        .send({ name: "New name", channelIds: [] });

      expect(res.status).toBe(404);
      expect(pool.connect).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/lists/:listId", () => {
    it("401s a malformed listId without touching the database, when unauthenticated", async () => {
      mockAuthPasses = false;

      const res = await request(buildApp()).delete(`/api/lists/${MALFORMED_LIST_ID}`);

      expect(res.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("404s a malformed listId once authenticated", async () => {
      const res = await request(buildApp()).delete(`/api/lists/${MALFORMED_LIST_ID}`);

      expect(res.status).toBe(404);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("404s a well-formed but nonexistent listId once authenticated", async () => {
      mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
        mockQueryResult({ rows: [], rowCount: 0 }),
      );

      const res = await request(buildApp()).delete(`/api/lists/${VALID_LIST_ID}`);

      expect(res.status).toBe(404);
      expect(pool.query).toHaveBeenCalled();
    });
  });
});
