import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock("../auth/google.js", async () => {
  const actual = await vi.importActual<typeof import("../auth/google.js")>("../auth/google.js");
  return {
    ...actual,
    exchangeCodeForTokens: vi.fn(),
    getGoogleUserFromIdToken: vi.fn(),
    revokeGoogleToken: vi.fn(),
  };
});

vi.mock("../auth/crypto.js", () => ({
  encryptRefreshToken: vi.fn(() => "fake-ciphertext"),
  decryptRefreshToken: vi.fn(() => "fake-refresh-token"),
}));

let mockAuthPasses = true;

vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!mockAuthPasses) {
      return res.status(401).json({ code: "AUTH_REQUIRED", message: "Not signed in" });
    }
    req.userId = "test-user-id";
    next();
  },
}));

const { pool } = await import("../db/pool.js");
const { exchangeCodeForTokens, getGoogleUserFromIdToken, revokeGoogleToken } = await import(
  "../auth/google.js"
);
const { encryptRefreshToken, decryptRefreshToken } = await import("../auth/crypto.js");
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

// covers the pool.query side of a callback: the google_sub lookup that
// decides new vs returning, and the shared queries after that branch
function mockCallbackQueries({
  userId = "user-1",
  sessionId = "session-1",
  existingUser = false,
} = {}) {
  vi.mocked(pool.query).mockImplementation(async (sql: any) => {
    const text = String(sql);
    if (text.includes("select id from users where google_sub")) {
      return existingUser
        ? ({ rows: [{ id: userId }], rowCount: 1 } as any)
        : ({ rows: [], rowCount: 0 } as any);
    }
    if (text.includes("update users set email")) {
      return { rows: [], rowCount: 1 } as any;
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

// covers the pool.connect side: a new signup's user insert and invite
// consumption, run on one checked-out client instead of the pool
function mockNewUserTransaction({ userId = "user-1", inviteSucceeds = true } = {}) {
  const clientQuery = vi.fn(async (sql: any) => {
    const text = String(sql);
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return {} as any;
    }
    if (text.includes("insert into users")) {
      return { rows: [{ id: userId }], rowCount: 1 } as any;
    }
    if (text.includes("update invites")) {
      return { rowCount: inviteSucceeds ? 1 : 0 } as any;
    }
    throw new Error(`Unexpected client query in mockNewUserTransaction: ${text}`);
  });
  const client = { query: clientQuery, release: vi.fn() };
  vi.mocked(pool.connect).mockResolvedValue(client as any);
  return client;
}

describe("GET /api/auth/login", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  function mockInviteLookup(exists: boolean) {
    vi.mocked(pool.query).mockResolvedValue(
      exists ? ({ rows: [{ "?column?": 1 }], rowCount: 1 } as any) : ({ rows: [], rowCount: 0 } as any),
    );
  }

  it("sets CSRF state and invite cookies, redirecting to a matching Google auth URL", async () => {
    mockInviteLookup(true);

    const res = await request(buildApp()).get("/api/auth/login").query({ invite: "code-1" });

    expect(res.status).toBe(302);

    const stateCookie = getSetCookie(res, "oauth_state");
    expect(stateCookie).not.toBeNull();
    expect(stateCookie!.raw).toContain("HttpOnly");
    expect(stateCookie!.raw).toContain("Max-Age=600");
    expect(stateCookie!.raw).toContain("SameSite=Lax");
    expect(stateCookie!.raw).not.toContain("Secure"); // env.isSecureContext is false in dev/test

    const inviteCookie = getSetCookie(res, "invite_code");
    expect(inviteCookie).not.toBeNull();
    expect(inviteCookie!.value).toBe("code-1");
    expect(inviteCookie!.raw).toContain("HttpOnly");

    const location = new URL(res.headers.location);
    expect(location.hostname).toBe("accounts.google.com");
    expect(location.searchParams.get("state")).toBe(stateCookie!.value);
  });

  it("403s and never redirects when no invite code is given", async () => {
    const res = await request(buildApp()).get("/api/auth/login");

    expect(res.status).toBe(403);
    expect(getSetCookie(res, "oauth_state")).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("403s and never redirects when the invite code doesn't exist", async () => {
    mockInviteLookup(false);

    const res = await request(buildApp()).get("/api/auth/login").query({ invite: "bogus" });

    expect(res.status).toBe(403);
    expect(getSetCookie(res, "oauth_state")).toBeNull();
  });
});

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(pool.connect).mockReset();
  });

  it("clears the cookie and responds ok with no DB call when there's no sid", async () => {
    const res = await request(buildApp()).post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(getSetCookie(res, "sid")).not.toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("deletes the local refresh token and revokes the session when a sid is present", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ user_id: "user-1" }], rowCount: 1 } as any);
    const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() };
    vi.mocked(pool.connect).mockResolvedValue(client as any);

    const res = await request(buildApp()).post("/api/auth/logout").set("Cookie", "sid=session-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(getSetCookie(res, "sid")).not.toBeNull();

    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(String(sql)).toContain("select user_id from sessions");
    expect(params).toEqual(["session-1"]);

    const clientCalls = client.query.mock.calls;
    expect(clientCalls[1][0]).toContain("delete from oauth_tokens");
    expect(clientCalls[1][1]).toEqual(["user-1"]);
    expect(clientCalls[2][0]).toContain("update sessions");
    expect(clientCalls[2][1]).toEqual(["session-1"]);
  });

  it("clears the cookie and responds ok without a transaction when the sid matches no session", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);

    const res = await request(buildApp()).post("/api/auth/logout").set("Cookie", "sid=stale-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(pool.connect).mockReset();
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

  it("creates the user, consumes the invite, stores the refresh token, and starts a session for a new signup", async () => {
    mockCallbackQueries({ userId: "user-1", sessionId: "session-1", existingUser: false });
    const client = mockNewUserTransaction({ userId: "user-1", inviteSucceeds: true });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      id_token: "fake.id.token",
      access_token: "fake-access-token",
      refresh_token: "fake-refresh-token",
      expires_in: 3600,
      scope: "openid email",
    });
    vi.mocked(getGoogleUserFromIdToken).mockResolvedValue({ sub: "google-sub-1", email: "user@example.com" });

    const res = await request(buildApp())
      .get("/api/auth/callback")
      .query({ code: "abc", state: "matching-state" })
      .set("Cookie", ["oauth_state=matching-state", "invite_code=code-1"]);

    expect(res.status).toBe(302);
    expect(encryptRefreshToken).toHaveBeenCalledWith("fake-refresh-token", expect.any(String));

    const clientCalls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(clientCalls).toEqual(
      expect.arrayContaining([
        "BEGIN",
        expect.stringContaining("insert into users"),
        expect.stringContaining("update invites"),
        "COMMIT",
      ]),
    );

    const poolCalls = vi.mocked(pool.query).mock.calls.map(([sql]) => String(sql));
    expect(poolCalls.some((sql) => sql.includes("insert into oauth_tokens"))).toBe(true);
    expect(poolCalls.some((sql) => sql.includes("update sessions") && sql.includes("user_id"))).toBe(true);
    expect(poolCalls.some((sql) => sql.includes("insert into sessions"))).toBe(true);

    const sidCookie = getSetCookie(res, "sid");
    expect(sidCookie).not.toBeNull();
    expect(sidCookie!.value).toBe("session-1");
    expect(sidCookie!.raw).toContain("HttpOnly");
    expect(sidCookie!.raw).toContain("SameSite=Lax");
  });

  it("lets a returning user in with no invite cookie, skipping the transaction entirely", async () => {
    mockCallbackQueries({ userId: "user-1", sessionId: "session-1", existingUser: true });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      id_token: "fake.id.token",
      access_token: "fake-access-token",
      refresh_token: "fake-refresh-token",
      expires_in: 3600,
      scope: "openid email",
    });
    vi.mocked(getGoogleUserFromIdToken).mockResolvedValue({ sub: "google-sub-1", email: "user@example.com" });

    const res = await request(buildApp())
      .get("/api/auth/callback")
      .query({ code: "abc", state: "matching-state" })
      .set("Cookie", "oauth_state=matching-state");

    expect(res.status).toBe(302);
    expect(pool.connect).not.toHaveBeenCalled();

    const poolCalls = vi.mocked(pool.query).mock.calls.map(([sql]) => String(sql));
    expect(poolCalls.some((sql) => sql.includes("update users set email"))).toBe(true);
    expect(poolCalls.some((sql) => sql.includes("insert into sessions"))).toBe(true);

    expect(getSetCookie(res, "sid")).not.toBeNull();
  });

  it("403s a new signup with no invite cookie, never touching the database", async () => {
    mockCallbackQueries({ existingUser: false });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({ id_token: "fake.id.token" });
    vi.mocked(getGoogleUserFromIdToken).mockResolvedValue({ sub: "google-sub-1" });

    const res = await request(buildApp())
      .get("/api/auth/callback")
      .query({ code: "abc", state: "matching-state" })
      .set("Cookie", "oauth_state=matching-state");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "An invite is required to sign in" });
    expect(pool.connect).not.toHaveBeenCalled();
    expect(getSetCookie(res, "sid")).toBeNull();
  });

  it("rolls back and 403s a new signup whose invite was already claimed by someone else", async () => {
    mockCallbackQueries({ existingUser: false });
    const client = mockNewUserTransaction({ userId: "user-1", inviteSucceeds: false });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({ id_token: "fake.id.token" });
    vi.mocked(getGoogleUserFromIdToken).mockResolvedValue({ sub: "google-sub-1" });

    const res = await request(buildApp())
      .get("/api/auth/callback")
      .query({ code: "abc", state: "matching-state" })
      .set("Cookie", ["oauth_state=matching-state", "invite_code=stale-code"]);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Invalid or already used invite code" });

    const clientCalls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(clientCalls).toEqual(
      expect.arrayContaining(["BEGIN", expect.stringContaining("update invites"), "ROLLBACK"]),
    );
    expect(clientCalls).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalled();
    expect(getSetCookie(res, "sid")).toBeNull();
  });

  it("skips storing oauth_tokens when Google doesn't return a refresh_token", async () => {
    mockCallbackQueries({ existingUser: false });
    mockNewUserTransaction();
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      id_token: "fake.id.token",
      access_token: "fake-access-token",
      // no refresh_token -- Google omits it unless prompt=consent was granted fresh
    });
    vi.mocked(getGoogleUserFromIdToken).mockResolvedValue({ sub: "google-sub-1" });

    const res = await request(buildApp())
      .get("/api/auth/callback")
      .query({ code: "abc", state: "matching-state" })
      .set("Cookie", ["oauth_state=matching-state", "invite_code=code-1"]);

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
      is_admin: false,
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

describe("DELETE /api/auth/account", () => {
  beforeEach(() => {
    mockAuthPasses = true;
    vi.mocked(pool.query).mockReset();
    vi.mocked(revokeGoogleToken).mockReset();
    vi.mocked(decryptRefreshToken).mockReset();
    vi.mocked(decryptRefreshToken).mockReturnValue("fake-refresh-token");
  });

  it("401s without calling the database, when unauthenticated", async () => {
    mockAuthPasses = false;

    const res = await request(buildApp()).delete("/api/auth/account");

    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("revokes the Google token and deletes the user when one is stored", async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: any) => {
      const text = String(sql);
      if (text.includes("select refresh_token_ciphertext")) {
        return { rows: [{ refresh_token_ciphertext: "fake-ciphertext" }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 1 } as any;
    });

    const res = await request(buildApp()).delete("/api/auth/account");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(decryptRefreshToken).toHaveBeenCalledWith("fake-ciphertext", expect.any(String));
    expect(revokeGoogleToken).toHaveBeenCalledWith("fake-refresh-token");

    const calls = vi.mocked(pool.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes("delete from users"))).toBe(true);
    expect(getSetCookie(res, "sid")).not.toBeNull();
  });

  it("skips revoking when the user never had a refresh token stored, but still deletes the user", async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: any) => {
      const text = String(sql);
      if (text.includes("select refresh_token_ciphertext")) {
        return { rows: [], rowCount: 0 } as any;
      }
      return { rows: [], rowCount: 1 } as any;
    });

    const res = await request(buildApp()).delete("/api/auth/account");

    expect(res.status).toBe(200);
    expect(revokeGoogleToken).not.toHaveBeenCalled();

    const calls = vi.mocked(pool.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes("delete from users"))).toBe(true);
  });

  it("still deletes the user even when revoking at Google throws", async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: any) => {
      const text = String(sql);
      if (text.includes("select refresh_token_ciphertext")) {
        return { rows: [{ refresh_token_ciphertext: "fake-ciphertext" }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 1 } as any;
    });
    vi.mocked(revokeGoogleToken).mockRejectedValue(new Error("network error"));

    const res = await request(buildApp()).delete("/api/auth/account");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const calls = vi.mocked(pool.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes("delete from users"))).toBe(true);
  });
});
