import type { Pool } from 'pg'

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

export async function insertSnapshot(
  pool: Pool,
  id: string,
  formatVersion: number,
  snapshotJson: string,
): Promise<boolean> {
  const inserted = await pool.query(
    `INSERT INTO restaurant_backups
       (id, format_version, snapshot)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [id, formatVersion, snapshotJson],
  )

  return Boolean(inserted.rowCount)
}

export async function getLatestBackup(
  pool: Pool,
) {
  const result = await pool.query(
    `SELECT id, format_version, snapshot, created_at
     FROM restaurant_backups
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
  )

  return result.rows[0]
}
