import { pool } from "../db/pool.js";

export type AppSettings = {
  refreshPaused: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

// fails open: a missing row leaves refreshes running instead of stopping them
export async function getAppSettings(): Promise<AppSettings> {
  const result = await pool.query(
    `select refresh_paused, updated_at, updated_by from app_settings where id = 1`,
  );
  const row = result.rows[0];

  return {
    refreshPaused: row?.refresh_paused ?? false,
    updatedAt: row ? (row.updated_at as Date).toISOString() : new Date(0).toISOString(),
    updatedBy: row?.updated_by ?? null,
  };
}

export async function setRefreshPaused(paused: boolean, userId: string): Promise<AppSettings> {
  const result = await pool.query(
    `
    update app_settings
    set refresh_paused = $1, updated_at = now(), updated_by = $2
    where id = 1
    returning refresh_paused, updated_at, updated_by
    `,
    [paused, userId],
  );
  const row = result.rows[0];

  return {
    refreshPaused: row.refresh_paused,
    updatedAt: (row.updated_at as Date).toISOString(),
    updatedBy: row.updated_by,
  };
}
