import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import pg from 'pg'

import { createApp } from '../dist/app.js'

const config = readFileSync(
  join(homedir(), '.config/restaurant-pwa/db.env'),
  'utf8',
)

const match = config.match(/^PGPASSWORD=([a-f0-9]{64})$/m)
if (!match) throw new Error('Configuration DB invalide.')

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)

const password = Buffer.concat(chunks)
  .toString('utf8')
  .replace(/\r?\n$/, '')

if (!password) throw new Error('Mot de passe manquant.')

const pool = new pg.Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'restaurant_app',
  database: 'restaurant_app',
  password: match[1],
  max: 2,
  connectionTimeoutMillis: 5000,
})

let server

try {
  const identity = await pool.query(
    'SELECT current_user, current_database()',
  )

  assert.equal(identity.rows[0].current_user, 'restaurant_app')
  assert.equal(
    identity.rows[0].current_database,
    'restaurant_app',
  )

  console.log('OK : base dédiée vérifiée')

  const admins = await pool.query(
    'SELECT count(*)::int AS total FROM restaurant_admin',
  )

  assert.equal(admins.rows[0].total, 1)

  console.log('OK : administrateur unique présent')

  server = createApp(pool).listen(0, '127.0.0.1')

  await new Promise((resolve, reject) => {
    if (server.listening) return resolve()
    server.once('listening', resolve)
    server.once('error', reject)
  })

  const address = server.address()
  assert.ok(address && typeof address !== 'string')

  const base = `http://127.0.0.1:${address.port}`

  async function login(candidate) {
    return fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: candidate }),
    })
  }

  const anonymous = await fetch(`${base}/auth/me`)
  assert.equal(anonymous.status, 401)

  console.log('OK : accès anonyme refusé')

  const wrong = await login(`${password}-incorrect`)
  assert.equal(wrong.status, 401)

  console.log('OK : mauvais mot de passe refusé')

  const valid = await login(password)
  assert.equal(valid.status, 200)

  const header = valid.headers.get('set-cookie')
  assert.ok(header)
  assert.match(header, /HttpOnly/)
  assert.match(header, /Secure/)
  assert.match(header, /SameSite=Strict/)

  console.log('OK : connexion réelle réussie')

  const cookie = header.split(';', 1)[0]

  const me = await fetch(`${base}/auth/me`, {
    headers: { Cookie: cookie },
  })

  assert.equal(me.status, 200)

  const sessions = await pool.query(
    `SELECT count(*)::int AS total
     FROM restaurant_sessions
     WHERE expires_at > now()`,
  )

  assert.ok(sessions.rows[0].total >= 1)

  console.log('OK : session enregistrée dans PostgreSQL')

  const logout = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  })

  assert.equal(logout.status, 204)

  const revoked = await fetch(`${base}/auth/me`, {
    headers: { Cookie: cookie },
  })

  assert.equal(revoked.status, 401)

  console.log('OK : déconnexion et révocation réelle')

  console.log('=== AUTHENTIFICATION POSTGRESQL VALIDEE ===')
} finally {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  }
  await pool.end()
}
