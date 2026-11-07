import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'

import { hashPassword } from '../dist/auth.js'

const configPath = join(
  homedir(),
  '.config/restaurant-pwa/db.env',
)

const config = readFileSync(configPath, 'utf8')

const match = config.match(
  /^PGPASSWORD=([a-f0-9]{64})$/m,
)

if (!match) {
  throw new Error('Configuration PostgreSQL invalide.')
}

const chunks = []

for await (const chunk of process.stdin) {
  chunks.push(chunk)
}

const password = Buffer.concat(chunks)
  .toString('utf8')
  .replace(/\n$/, '')

if (password.length < 16) {
  throw new Error('Mot de passe trop court : 16 caractères minimum.')
}

const passwordHash = await hashPassword(password)

const pool = new pg.Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'restaurant_app',
  database: 'restaurant_app',
  password: match[1],
  max: 1,
  connectionTimeoutMillis: 5000,
})

let client

try {
  client = await pool.connect()

  const identity = await client.query(
    'SELECT current_user AS role, current_database() AS database',
  )

  if (
    identity.rows[0]?.role !== 'restaurant_app' ||
    identity.rows[0]?.database !== 'restaurant_app'
  ) {
    throw new Error('Connexion à une base inattendue.')
  }

  await client.query('BEGIN')

  const result = await client.query(
    `INSERT INTO restaurant_admin (id, password_hash)
     VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [passwordHash],
  )

  if (result.rowCount !== 1) {
    await client.query('ROLLBACK')

    throw new Error(
      'Un administrateur existe déjà. Aucun remplacement effectué.',
    )
  }

  await client.query('COMMIT')

  console.log('OK : administrateur unique créé')
  console.log('OK : mot de passe enregistré uniquement sous forme de hachage')
  console.log('OK : base restaurant_app utilisée')

} catch (error) {
  if (client) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ne pas masquer l'erreur initiale.
    }
  }

  console.error(
    error instanceof Error
      ? error.message
      : 'Provisionnement impossible.',
  )

  process.exitCode = 1

} finally {
  client?.release()
  await pool.end()
}
