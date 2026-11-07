import { Router } from 'express'
import type { Pool } from 'pg'
import { randomUUID } from 'node:crypto'

import {
  generateSessionToken,
  hashSessionToken,
  verifyPassword,
} from './auth.js'

const COOKIE = 'restaurant_session'
const SESSION_SECONDS = 30 * 24 * 60 * 60
const attempts = new Map<string, {
  count: number
  until: number
}>()

function cookieValue(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`
}

function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}

function readToken(header: string | undefined): string | null {
  const match = header?.match(
    /(?:^|;\s*)restaurant_session=([a-f0-9]{64})(?:;|$)/,
  )

  return match?.[1] ?? null
}

export function createAuthRouter(pool: Pool): Router {
  const router = Router()

  router.post('/login', async (request, response) => {
    const ip = request.ip ?? 'unknown'
    const now = Date.now()
    const state = attempts.get(ip)

    if (state && state.until > now && state.count >= 5) {
      response.status(429).json({
        error: 'Trop de tentatives. Réessayez plus tard.',
      })
      return
    }

    const password = request.body?.password

    if (
      typeof password !== 'string' ||
      password.length < 1 ||
      password.length > 1024
    ) {
      response.status(400).json({
        error: 'Mot de passe invalide.',
      })
      return
    }

    try {
      const result = await pool.query<{
        password_hash: string
      }>(
        'SELECT password_hash FROM restaurant_admin WHERE id = 1',
      )

      const stored = result.rows[0]?.password_hash

      const valid = stored
        ? await verifyPassword(password, stored)
        : false

      if (!valid) {
        const previous =
          state && state.until > now ? state.count : 0

        attempts.set(ip, {
          count: previous + 1,
          until: now + 15 * 60 * 1000,
        })

        response.status(401).json({
          error: 'Identifiants incorrects.',
        })
        return
      }

      const token = generateSessionToken()
      const expires = new Date(
        Date.now() + SESSION_SECONDS * 1000,
      )

      await pool.query(
        `INSERT INTO restaurant_sessions
         (id, admin_id, token_hash, expires_at)
         VALUES ($1, 1, $2, $3)`,
        [randomUUID(), hashSessionToken(token), expires],
      )

      attempts.delete(ip)

      response.setHeader('Set-Cookie', cookieValue(token))
      response.json({ authenticated: true })
    } catch {
      response.status(503).json({
        error: 'Authentification momentanément indisponible.',
      })
    }
  })

  router.get('/me', async (request, response) => {
    const token = readToken(request.headers.cookie)

    if (!token) {
      response.status(401).json({ authenticated: false })
      return
    }

    try {
      const result = await pool.query(
        `SELECT id FROM restaurant_sessions
         WHERE token_hash = $1
           AND expires_at > now()
         LIMIT 1`,
        [hashSessionToken(token)],
      )

      if (!result.rowCount) {
        response.status(401).json({ authenticated: false })
        return
      }

      response.json({ authenticated: true })
    } catch {
      response.status(503).json({
        error: 'Session momentanément indisponible.',
      })
    }
  })

  router.post('/logout', async (request, response) => {
    const token = readToken(request.headers.cookie)

    try {
      if (token) {
        await pool.query(
          'DELETE FROM restaurant_sessions WHERE token_hash = $1',
          [hashSessionToken(token)],
        )
      }

      response.setHeader('Set-Cookie', clearCookie())
      response.status(204).end()
    } catch {
      response.status(503).json({
        error: 'Déconnexion momentanément indisponible.',
      })
    }
  })

  return router
}
