import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

vi.mock("../auth/google.js", async () => {
  const actual = await vi.importActual<typeof import("../auth/google.js")>("../auth/google.js");
  return {
    ...actual,
    exchangeCodeForTokens: vi.fn(),
    getGoogleUserFromIdToken: vi.fn(),
  };
});

vi.mock("../auth/crypto.js", () => ({
  encryptRefreshToken: vi.fn(() => "fake-ciphertext"),
}));

const { pool } = await import("../db/pool.js");
const { exchangeCodeForTokens, getGoogleUserFromIdToken } = await import("../auth/google.js");
const { encryptRefreshToken } = await import("../auth/crypto.js");
const { authRouter } = await import("./auth.js");

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  return app;
}

// supertest exposes raw Set-Cookie strings; find the one for `name` and
// return both its value and the full attribute string for assertions
function getSetCookie(res: request.Response, name: string) {
  const raw = ((res.headers["set-cookie"] as unknown as string[]) ?? []).find((c) =>
    c.startsWith(`${name}=`),
  );
  if (!raw) return null;
  const value = raw.split(";")[0].split("=")[1];
  return { raw, value };
}

function mockCallbackQueries({ userId = "user-1", sessionId = "session-1" } = {}) {
  vi.mocked(pool.query).mockImplementation(async (sql: any) => {
    const text = String(sql);
    if (text.includes("insert into users")) {
      return { rows: [{ id: userId }], rowCount: 1 } as any;
    }
    if (text.includes("insert into oauth_tokens")) {
      return { rows: [], rowCount: 1 } as any;
    }
    if (text.includes("update sessions") && text.includes("user_id")) {
      return { rows: [], rowCount: 0 } as any;
    }
    if (text.includes("insert into sessions")) {
      return { rows: [{ id: sessionId }], rowCount: 1 } as any;
    }
    throw new Error(`Unexpected query in mockCallbackQueries: ${text}`);
  });
}

describe("GET /api/auth/login", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("sets a CSRF state cookie and redirects to a matching Google auth URL", async () => {
    const res = await request(buildApp()).get("/api/auth/login");

    expect(res.status).toBe(302);

    const stateCookie = getSetCookie(res, "oauth_state");
    expect(stateCookie).not.toBeNull();
    expect(stateCookie!.raw).toContain("HttpOnly");
    expect(stateCookie!.raw).toContain("Max-Age=600");
    expect(stateCookie!.raw).not.toContain("Secure"); // env.isSecureContext is false in dev/test

    const location = new URL(res.headers.location);
    expect(location.hostname).toBe("accounts.google.com");
    expect(location.searchParams.get("state")).toBe(stateCookie!.value);
  });
});

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("clears the cookie and responds ok with no DB call when there's no sid", async () => {
    const res = await request(buildApp()).post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(getSetCookie(res, "sid")).not.toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("revokes the session and clears the cookie when a sid is present", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const res = await request(buildApp()).post("/api/auth/logout").set("Cookie", "sid=session-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(getSetCookie(res, "sid")).not.toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(String(sql)).toContain("update sessions");
    expect(params).toEqual(["session-1"]);
  });
});

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(exchangeCodeForTokens).mockReset();
    vi.mocked(getGoogleUserFromIdToken).mockReset();
    vi.mocked(encryptRefreshToken).mockClear();
  });

  it("400s when Google reports an error", async () => {
    const res = await request(buildApp()).get("/api/auth/callback").query({ error: "access_denied" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "access_denied" });
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("400s when code is missing", async () => {
    const res = await request(buildApp()).get("/api/auth/callback").query({ state: "abc" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing code" });
  });

  it("400s when state is missing", async () => {
    const res = await request(buildApp()).get("/api/auth/callback").query({ code: "abc" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing state" });
  });

  it("400s and never exchanges the code when state doesn't match the cookie", async () => {
    const res = await request(buildApp())
      .get("/api/auth/callback")
      .query({ code: "abc", state: "state-from-google" })
      .set("Cookie", "oauth_state=different-state");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid oauth state" });
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("400s when state is valid but the oauth_state cookie is missing entirely", async () => {
    const res = await request(buildApp())
      .get("/api/auth/callback")
      .query({ code: "abc", state: "state-from-google" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid oauth state" });
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("creates the user, stores the refresh token, and starts a session on the happy path", async () => {
    mockCallbackQueries({ userId: "user-1", sessionId: "session-1" });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      id_token: "fake.id.token",
      access_token: "fake-access-token",
      refresh_token: "fake-refresh-token",
      expires_in: 3600,
      scope: "openid email",
    });
    vi.mocked(getGoogleUserFromIdToken).mockReturnValue({ sub: "google-sub-1", email: "user@example.com" });

    const res = await request(buildApp())
      .get("/api/auth/callback")
      .query({ code: "abc", state: "matching-state" })
      .set("Cookie", "oauth_state=matching-state");

    expect(res.status).toBe(302);
    expect(encryptRefreshToken).toHaveBeenCalledWith("fake-refresh-token", expect.any(String));

    const calls = vi.mocked(pool.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes("insert into users"))).toBe(true);
    expect(calls.some((sql) => sql.includes("insert into oauth_tokens"))).toBe(true);
    expect(calls.some((sql) => sql.includes("update sessions") && sql.includes("user_id"))).toBe(true);
    expect(calls.some((sql) => sql.includes("insert into sessions"))).toBe(true);

    const sidCookie = getSetCookie(res, "sid");
    expect(sidCookie).not.toBeNull();
    expect(sidCookie!.value).toBe("session-1");
    expect(sidCookie!.raw).toContain("HttpOnly");
  });

  it("skips storing oauth_tokens when Google doesn't return a refresh_token", async () => {
    mockCallbackQueries();
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      id_token: "fake.id.token",
      access_token: "fake-access-token",
      // no refresh_token -- Google omits it unless prompt=consent was granted fresh
    });
    vi.mocked(getGoogleUserFromIdToken).mockReturnValue({ sub: "google-sub-1" });

    const res = await request(buildApp())
      .get("/api/auth/callback")
      .query({ code: "abc", state: "matching-state" })
      .set("Cookie", "oauth_state=matching-state");

    expect(res.status).toBe(302);
    expect(encryptRefreshToken).not.toHaveBeenCalled();

    const calls = vi.mocked(pool.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes("insert into oauth_tokens"))).toBe(false);
    expect(calls.some((sql) => sql.includes("insert into sessions"))).toBe(true);
  });

  it("400s when Google's response is missing an id_token", async () => {
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({ access_token: "fake-access-token" });

    const res = await request(buildApp())
      .get("/api/auth/callback")
      .query({ code: "abc", state: "matching-state" })
      .set("Cookie", "oauth_state=matching-state");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing id_token from Google" });
    expect(getGoogleUserFromIdToken).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/whoami", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("returns null when there's no sid cookie", async () => {
    const res = await request(buildApp()).get("/api/auth/whoami");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns the joined user row for a valid session", async () => {
    const row = {
      id: "user-1",
      email: "user@example.com",
      google_sub: "google-sub-1",
      expires_at: "2026-09-01T00:00:00Z",
    };
    vi.mocked(pool.query).mockResolvedValue({ rows: [row], rowCount: 1 } as any);

    const res = await request(buildApp()).get("/api/auth/whoami").set("Cookie", "sid=session-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: row });
  });

  it("returns null when the sid doesn't match a valid session", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);

    const res = await request(buildApp()).get("/api/auth/whoami").set("Cookie", "sid=stale-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });
});
