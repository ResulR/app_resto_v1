import type { Pool } from 'pg'

export async function getAdminPasswordHash(
  pool: Pool,
): Promise<string | undefined> {
  const result = await pool.query<{
    password_hash: string
  }>(
    'SELECT password_hash FROM restaurant_admin WHERE id = 1',
  )

  return result.rows[0]?.password_hash
}

export async function createSession(
  pool: Pool,
  id: string,
  tokenHash: string,
  expires: Date,
): Promise<void> {
  await pool.query(
    `INSERT INTO restaurant_sessions
     (id, admin_id, token_hash, expires_at)
     VALUES ($1, 1, $2, $3)`,
    [id, tokenHash, expires],
  )
}

export async function sessionExists(
  pool: Pool,
  tokenHash: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM restaurant_sessions
     WHERE token_hash = $1
       AND expires_at > now()
     LIMIT 1`,
    [tokenHash],
  )

  return Boolean(result.rowCount)
}

export async function deleteSession(
  pool: Pool,
  tokenHash: string,
): Promise<void> {
  await pool.query(
    'DELETE FROM restaurant_sessions WHERE token_hash = $1',
    [tokenHash],
  )
}
