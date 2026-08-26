import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPool, mockedQuery, mockQueryResult } from "../testUtils/pgMocks.js";

vi.mock("../db/pool.js", () => ({
  pool: createMockPool(),
}));

const { pool } = await import("../db/pool.js");
const { getAppSettings, setRefreshPaused } = await import("./appSettings.js");

describe("getAppSettings", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("returns the settings row when one exists", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({
      rows: [
        {
          refresh_paused: true,
          updated_at: new Date("2026-08-20T12:00:00Z"),
          updated_by: "user-1",
        },
      ],
    }));

    const settings = await getAppSettings();

    expect(settings).toEqual({
      refreshPaused: true,
      updatedAt: "2026-08-20T12:00:00.000Z",
      updatedBy: "user-1",
    });
  });

  it("fails open to refreshPaused: false when the row is missing", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(
      mockQueryResult({ rows: [] }),
    );

    const settings = await getAppSettings();

    expect(settings.refreshPaused).toBe(false);
    expect(settings.updatedBy).toBeNull();
  });
});

describe("setRefreshPaused", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("updates the row and returns the new state", async () => {
    mockedQuery(vi.mocked(pool.query)).mockResolvedValue(mockQueryResult({
      rows: [
        {
          refresh_paused: true,
          updated_at: new Date("2026-08-20T12:00:00Z"),
          updated_by: "user-1",
        },
      ],
    }));

    const settings = await setRefreshPaused(true, "user-1");

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("update app_settings"), [
      true,
      "user-1",
    ]);
    expect(settings).toEqual({
      refreshPaused: true,
      updatedAt: "2026-08-20T12:00:00.000Z",
      updatedBy: "user-1",
    });
  });
});
