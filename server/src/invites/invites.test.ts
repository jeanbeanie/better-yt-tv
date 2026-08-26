import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockPool,
  createMockPoolClient,
  mockedQuery,
  mockQueryResult,
} from "../testUtils/pgMocks.js";

vi.mock("../db/pool.js", () => ({
  pool: createMockPool(),
}));

const { pool } = await import("../db/pool.js");
const { validateInviteCode, consumeInviteCode, createInvite, listInvites, deleteInvite, countUsers } =
  await import("./invites.js");

beforeEach(() => {
  vi.mocked(pool.query).mockReset();
});

describe("validateInviteCode", () => {
  it("returns true when a matching code exists, even if already used", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [{ "?column?": 1 }], rowCount: 1 }),
    );

    expect(await validateInviteCode("code-1")).toBe(true);
  });

  it("returns false when no matching code exists", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [], rowCount: 0 }),
    );

    expect(await validateInviteCode("code-1")).toBe(false);
  });
});

describe("consumeInviteCode", () => {
  it("returns true when the update affects a row", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({ rowCount: 1 }));

    expect(await consumeInviteCode("code-1", "user-1", pool)).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("used_by = $1"), [
      "user-1",
      "code-1",
    ]);
  });

  it("returns false when the code belongs to someone else or never existed", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({ rowCount: 0 }));

    expect(await consumeInviteCode("code-1", "user-1", pool)).toBe(false);
  });

  it("runs its query on whichever client it's given, not the shared pool", async () => {
    const client = createMockPoolClient();
    mockedQuery(vi.mocked(client.query)).mockResolvedValue(mockQueryResult({ rowCount: 1 }));

    expect(await consumeInviteCode("code-1", "user-1", client)).toBe(true);
    expect(client.query).toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("createInvite", () => {
  it("inserts a new code and returns it unused", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({
      rows: [
        {
          code: "generated-code",
          note: "for a friend",
          created_at: new Date("2026-08-23T12:00:00Z"),
        },
      ],
    }));

    const invite = await createInvite("for a friend", "admin-1");

    expect(invite).toEqual({
      code: "generated-code",
      note: "for a friend",
      createdAt: "2026-08-23T12:00:00.000Z",
      usedAt: null,
      usedByEmail: null,
    });

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params?.[1]).toBe("for a friend");
    expect(params?.[2]).toBe("admin-1");
    expect(params?.[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("listInvites", () => {
  it("maps joined rows, including an invite nobody has used yet", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({
      rows: [
        {
          code: "used-code",
          note: null,
          created_at: new Date("2026-08-20T00:00:00Z"),
          used_at: new Date("2026-08-21T00:00:00Z"),
          used_by_email: "friend@example.com",
        },
        {
          code: "unused-code",
          note: "spare",
          created_at: new Date("2026-08-22T00:00:00Z"),
          used_at: null,
          used_by_email: null,
        },
      ],
    }));

    const invites = await listInvites();

    expect(invites).toEqual([
      {
        code: "used-code",
        note: null,
        createdAt: "2026-08-20T00:00:00.000Z",
        usedAt: "2026-08-21T00:00:00.000Z",
        usedByEmail: "friend@example.com",
      },
      {
        code: "unused-code",
        note: "spare",
        createdAt: "2026-08-22T00:00:00.000Z",
        usedAt: null,
        usedByEmail: null,
      },
    ]);
  });
});

describe("deleteInvite", () => {
  it("returns true when an unused code is deleted", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({ rowCount: 1 }));

    expect(await deleteInvite("code-1")).toBe(true);
  });

  it("returns false when the code was already used or never existed", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({ rowCount: 0 }));

    expect(await deleteInvite("code-1")).toBe(false);
  });
});

describe("countUsers", () => {
  it("returns the count from the query", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [{ count: 37 }] }),
    );

    expect(await countUsers()).toBe(37);
  });
});
