import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db/pool.js";

export type Invite = {
  code: string;
  note: string | null;
  createdAt: string;
  usedAt: string | null;
  usedByEmail: string | null;
};

// checked before we know who's asking, so this only confirms the code is
// real, not that it's still claimable
export async function validateInviteCode(code: string): Promise<boolean> {
  const result = await pool.query(`select 1 from invites where code = $1`, [code]);
  return (result.rowCount ?? 0) > 0;
}

// succeeds for a fresh code or the same user reclaiming it, since the
// client remembers a working code and reuses it on every login
export async function consumeInviteCode(
  code: string,
  userId: string,
  db: Pool | PoolClient,
): Promise<boolean> {
  const result = await db.query(
    `
    update invites
    set used_by = $1, used_at = coalesce(used_at, now())
    where code = $2
      and (used_at is null or used_by = $1)
    `,
    [userId, code],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function createInvite(note: string | null, createdBy: string): Promise<Invite> {
  const code = crypto.randomUUID();
  const result = await pool.query(
    `
    insert into invites (code, note, created_by)
    values ($1, $2, $3)
    returning code, note, created_at
    `,
    [code, note, createdBy],
  );
  const row = result.rows[0];

  return {
    code: row.code,
    note: row.note,
    createdAt: (row.created_at as Date).toISOString(),
    usedAt: null,
    usedByEmail: null,
  };
}

export async function listInvites(): Promise<Invite[]> {
  const result = await pool.query(
    `
    select
      i.code,
      i.note,
      i.created_at,
      i.used_at,
      u.email as used_by_email
    from invites i
    left join users u on u.id = i.used_by
    order by i.created_at desc
    `,
  );

  return result.rows.map((row) => ({
    code: row.code,
    note: row.note,
    createdAt: (row.created_at as Date).toISOString(),
    usedAt: row.used_at ? (row.used_at as Date).toISOString() : null,
    usedByEmail: row.used_by_email ?? null,
  }));
}

// google doesn't show a real count for the 100 user cap, so this is the
// closest estimate available
export async function countUsers(): Promise<number> {
  const result = await pool.query(`select count(*)::int as count from users`);
  return result.rows[0].count;
}

export async function deleteInvite(code: string): Promise<boolean> {
  const result = await pool.query(`delete from invites where code = $1 and used_at is null`, [
    code,
  ]);
  return (result.rowCount ?? 0) > 0;
}
