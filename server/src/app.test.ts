import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "./app.js";

// fake static dir standing in for a real vite build, so this test doesn't
// depend on the client actually being built
let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-test-dist-"));
  fs.writeFileSync(path.join(tmpDir, "index.html"), "<html>fake index</html>");
  fs.mkdirSync(path.join(tmpDir, "assets"));
  fs.writeFileSync(path.join(tmpDir, "assets", "index-fake123.js"), "console.log('fake bundle')");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("createApp static serving and spa fallback", () => {
  it("still serves real api routes", async () => {
    const app = createApp(tmpDir);

    const res = await request(app).get("/api/test");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns a json 404 for an unmatched api path instead of the spa fallback", async () => {
    const app = createApp(tmpDir);

    const res = await request(app).get("/api/definitely-not-a-real-route");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("serves a hashed asset with a long immutable cache header", async () => {
    const app = createApp(tmpDir);

    const res = await request(app).get("/assets/index-fake123.js");

    expect(res.status).toBe(200);
    expect(res.text).toBe("console.log('fake bundle')");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(res.headers["cache-control"]).toContain("max-age");
  });

  it("falls back to index.html with a no-cache header for a frontend route", async () => {
    const app = createApp(tmpDir);

    const res = await request(app).get("/all");

    expect(res.status).toBe(200);
    expect(res.text).toBe("<html>fake index</html>");
    expect(res.headers["cache-control"]).toBe("no-cache");
  });

  it("falls back to index.html for a nested frontend route too", async () => {
    const app = createApp(tmpDir);

    const res = await request(app).get("/settings/channels");

    expect(res.status).toBe(200);
    expect(res.text).toBe("<html>fake index</html>");
  });
});
