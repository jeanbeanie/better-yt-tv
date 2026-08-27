import { describe, it, expect, vi, beforeEach } from "vitest";
import { asPoolClient, createMockPool, mockedConnect } from "../testUtils/pgMocks.js";

vi.mock("../db/pool.js", () => ({
  pool: createMockPool(),
}));

const { pool } = await import("../db/pool.js");
const { revokeSessionAndTokens } = await import("./revoke.js");

function fakeClient() {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() };
}

describe("revokeSessionAndTokens", () => {
  beforeEach(() => {
    vi.mocked(pool.connect).mockReset();
  });

  it("commits both writes when a sid is given", async () => {
    const client = fakeClient();
    mockedConnect(vi.mocked(pool.connect)).mockResolvedValue(asPoolClient(client));

    await revokeSessionAndTokens("user-1", "session-1");

    const calls = client.query.mock.calls;
    expect(calls[0][0]).toBe("BEGIN");
    expect(calls[1][0]).toContain("delete from oauth_tokens");
    expect(calls[1][1]).toEqual(["user-1"]);
    expect(calls[2][0]).toContain("update sessions");
    expect(calls[2][1]).toEqual(["session-1"]);
    expect(calls[3][0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("skips the session update when no sid is given", async () => {
    const client = fakeClient();
    mockedConnect(vi.mocked(pool.connect)).mockResolvedValue(asPoolClient(client));

    await revokeSessionAndTokens("user-1");

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

    await expect(revokeSessionAndTokens("user-1", "session-1")).rejects.toThrow(
      "connection reset",
    );

    const sqlCalls = client.query.mock.calls.map((call) => call[0]);
    expect(sqlCalls).toContain("ROLLBACK");
    expect(sqlCalls).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
