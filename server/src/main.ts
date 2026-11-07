import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

import { createApp } from './app.js'

const host = '127.0.0.1'
const port = 4600

const origin = process.env.RESTAURANT_ALLOWED_ORIGIN

if (!origin || !/^https:\/\/[^/]+$/.test(origin)) {
  throw new Error(
    'RESTAURANT_ALLOWED_ORIGIN doit être une origine HTTPS.',
  )
}

const secretPath = process.env.RESTAURANT_DB_PASSWORD_FILE

if (!secretPath) {
  throw new Error(
    'RESTAURANT_DB_PASSWORD_FILE non configuré.',
  )
}

const absolutePath = resolve(secretPath)
const info = statSync(absolutePath)

if (!info.isFile() || (info.mode & 0o077) !== 0) {
  throw new Error(
    'Le fichier secret doit être privé (permissions 600).',
  )
}

const content = readFileSync(absolutePath, 'utf8')
const match = content.match(/^PGPASSWORD=([a-f0-9]{64})$/m)

if (!match) {
  throw new Error('Format du secret PostgreSQL invalide.')
}

const pool = new pg.Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'restaurant_app',
  database: 'restaurant_app',
  password: match[1],
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
})

async function main() {
  const identity = await pool.query<{
    current_user: string
    current_database: string
  }>('SELECT current_user, current_database()')

  const connected = identity.rows[0]

  if (
    connected?.current_user !== 'restaurant_app' ||
    connected?.current_database !== 'restaurant_app'
  ) {
    throw new Error('Identité PostgreSQL inattendue.')
  }

  const server = createApp(pool).listen(port, host)

  server.on('error', error => {
    console.error(
      'Erreur serveur :',
      error instanceof Error ? error.message : 'inconnue',
    )
    process.exitCode = 1
  })

  server.on('listening', () => {
    console.log(`Restaurant API active sur ${host}:${port}`)
  })

  let stopping = false

  async function shutdown() {
    if (stopping) return
    stopping = true

    server.close(async error => {
      if (error) {
        console.error('Arrêt HTTP incomplet.')
        process.exitCode = 1
      }

      try {
        await pool.end()
      } catch {
        process.exitCode = 1
      }
    })
  }

  process.once('SIGTERM', () => void shutdown())
  process.once('SIGINT', () => void shutdown())
}

main().catch(async error => {
  console.error(
    'Démarrage impossible :',
    error instanceof Error ? error.message : 'inconnu',
  )

  process.exitCode = 1
  await pool.end()
})
