import { Router } from 'express'
import type { Pool } from 'pg'
import { createHash } from 'node:crypto'

import { hashSessionToken } from './auth.js'
import {
  BackupValidationError,
  validateBackup,
} from './backupValidation.js'

const COOKIE = 'restaurant_session'

function readSessionToken(
  header: string | undefined,
): string | null {
  const match = header?.match(
    /(?:^|;\s*)restaurant_session=([a-f0-9]{64})(?:;|$)/,
  )

  return match?.[1] ?? null
}

/**
 * Identifiant déterministe à partir de l'empreinte.
 *
 * Deux envois du même instantané produisent le même UUID.
 * Aucun changement de schéma PostgreSQL n'est nécessaire.
 */
function backupId(sha256: string): string {
  const bytes = Buffer.from(sha256, 'hex').subarray(0, 16)

  // UUID version 8, variante RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = bytes.toString('hex')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

function validHash(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{64}$/.test(value)
  )
}

export function createBackupRouter(pool: Pool): Router {
  const router = Router()

  router.post('/snapshots', async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')

    const token = readSessionToken(request.headers.cookie)

    if (!token) {
      response.status(401).json({
        error: 'Authentification requise.',
      })
      return
    }

    try {
      const session = await pool.query(
        `SELECT id FROM restaurant_sessions
         WHERE token_hash = $1
           AND expires_at > now()
         LIMIT 1`,
        [hashSessionToken(token)],
      )

      if (!session.rowCount) {
        response.status(401).json({
          error: 'Session invalide.',
        })
        return
      }
    } catch {
      response.status(503).json({
        error: 'Vérification de session indisponible.',
      })
      return
    }

    const body = request.body

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).sort().join(',') !==
        'sha256,snapshot'
    ) {
      response.status(400).json({
        error: 'Enveloppe de sauvegarde invalide.',
      })
      return
    }

    if (!validHash(body.sha256)) {
      response.status(400).json({
        error: 'Empreinte SHA-256 invalide.',
      })
      return
    }

    let validated

    try {
      validated = validateBackup(body.snapshot)
    } catch (error) {
      if (error instanceof BackupValidationError) {
        response.status(400).json({
          error: error.message,
        })
        return
      }

      response.status(400).json({
        error: 'Sauvegarde invalide.',
      })
      return
    }

    if (body.sha256 !== validated.sha256) {
      response.status(422).json({
        error: 'Empreinte de sauvegarde incorrecte.',
      })
      return
    }

    const id = backupId(validated.sha256)

    try {
      const inserted = await pool.query(
        `INSERT INTO restaurant_backups
           (id, format_version, snapshot)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          id,
          validated.snapshot.formatVersion,
          JSON.stringify(validated.snapshot),
        ],
      )

      const created = Boolean(inserted.rowCount)

      response.status(created ? 201 : 200).json({
        id,
        sha256: validated.sha256,
        stored: true,
        duplicate: !created,
      })
    } catch {
      response.status(503).json({
        error: 'Enregistrement de sauvegarde indisponible.',
      })
    }
  })

  return router
}
