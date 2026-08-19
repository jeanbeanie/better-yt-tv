import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { requireAdmin } from "./requireAdmin.js";

function buildApp(isAdmin: boolean | undefined) {
  const app = express();
  app.get(
    "/test",
    (req: any, _res, next) => {
      req.isAdmin = isAdmin;
      next();
    },
    requireAdmin,
    (_req, res) => res.json({ ok: true }),
  );
  return app;
}

describe("requireAdmin", () => {
  it("calls next() when isAdmin is true", async () => {
    const res = await request(buildApp(true)).get("/test");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("403s with ADMIN_REQUIRED when isAdmin is false", async () => {
    const res = await request(buildApp(false)).get("/test");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      code: "ADMIN_REQUIRED",
      message: "You are not authorized to view this page.",
    });
  });

  it("403s when isAdmin is unset", async () => {
    const res = await request(buildApp(undefined)).get("/test");

    expect(res.status).toBe(403);
  });
});
