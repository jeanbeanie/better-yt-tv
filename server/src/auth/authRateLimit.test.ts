import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { createAuthRateLimit } from "./authRateLimit.js";

function buildApp(limit: number) {
  const app = express();
  app.get("/test", createAuthRateLimit({ limit }), (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createAuthRateLimit", () => {
  it("allows requests under the limit", async () => {
    const app = buildApp(3);

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/test");
      expect(res.status).toBe(200);
    }
  });

  it("blocks requests once the limit is exceeded", async () => {
    const app = buildApp(3);

    for (let i = 0; i < 3; i++) {
      await request(app).get("/test");
    }

    const res = await request(app).get("/test");
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Too many requests, please try again later" });
  });
});
