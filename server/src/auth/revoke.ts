import { pool } from "../db/pool.js";

// deletes a user's local Google refresh token and revokes their session, in
// one transaction so a failure partway through can't leave one done
// without the other
export async function revokeSessionAndTokens(userId: string, sid?: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      delete from oauth_tokens
      where user_id = $1
      `,
      [userId],
    );

    if (sid) {
      await client.query(
        `
        update sessions
        set revoked_at = now()
        where id = $1
        `,
        [sid],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
