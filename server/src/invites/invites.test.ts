import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

const { pool } = await import("../db/pool.js");
const { validateInviteCode, consumeInviteCode, createInvite, listInvites, deleteInvite } =
  await import("./invites.js");

beforeEach(() => {
  vi.mocked(pool.query).mockReset();
});

describe("validateInviteCode", () => {
  it("returns true when an unused matching code exists", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 } as any);

    expect(await validateInviteCode("code-1")).toBe(true);
  });

  it("returns false when no matching unused code exists", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);

    expect(await validateInviteCode("code-1")).toBe(false);
  });
});

describe("consumeInviteCode", () => {
  it("returns true when the update affects a row", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 1 } as any);

    expect(await consumeInviteCode("code-1", "user-1")).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("update invites"), [
      "user-1",
      "code-1",
    ]);
  });

  it("returns false when the code was already used or never existed", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 0 } as any);

    expect(await consumeInviteCode("code-1", "user-1")).toBe(false);
  });
});

describe("createInvite", () => {
  it("inserts a new code and returns it unused", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          code: "generated-code",
          note: "for a friend",
          created_at: new Date("2026-08-23T12:00:00Z"),
        },
      ],
    } as any);

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
    vi.mocked(pool.query).mockResolvedValue({
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
    } as any);

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
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 1 } as any);

    expect(await deleteInvite("code-1")).toBe(true);
  });

  it("returns false when the code was already used or never existed", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 0 } as any);

    expect(await deleteInvite("code-1")).toBe(false);
  });
});
