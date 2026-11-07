import test from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'

import { createApp } from '../src/app.js'
import { hashPassword } from '../src/auth.js'

test('parcours complet de connexion et déconnexion', async () => {
  const password = 'MotDePasse-Test-Long-2026!'
  const passwordHash = await hashPassword(password)
  const sessions = new Map<string, Date>()

  // Simulation strictement locale du comportement PostgreSQL.
  // Aucun accès à la base réelle.
  const pool = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.includes('SELECT password_hash')) {
        return {
          rows: [{ password_hash: passwordHash }],
          rowCount: 1,
        }
      }

      if (sql.includes('INSERT INTO restaurant_sessions')) {
        const tokenHash = values[1]

        assert.equal(typeof tokenHash, 'string')
        assert.match(tokenHash as string, /^[a-f0-9]{64}$/)

        sessions.set(tokenHash as string, values[2] as Date)

        return { rows: [], rowCount: 1 }
      }

      if (sql.includes('SELECT id FROM restaurant_sessions')) {
        const tokenHash = values[0] as string
        const expiry = sessions.get(tokenHash)

        return {
          rows: expiry && expiry > new Date()
            ? [{ id: 'session' }]
            : [],
          rowCount: expiry && expiry > new Date() ? 1 : 0,
        }
      }

      if (sql.includes('DELETE FROM restaurant_sessions')) {
        const deleted = sessions.delete(values[0] as string)

        return {
          rows: [],
          rowCount: deleted ? 1 : 0,
        }
      }

      throw new Error(`Requête SQL inattendue : ${sql}`)
    },
  } as unknown as Pool

  const server = createApp(pool).listen(0, '127.0.0.1')

  try {
    await new Promise<void>((resolve, reject) => {
      if (server.listening) return resolve()

      server.once('listening', resolve)
      server.once('error', reject)
    })

    const address = server.address()
    assert.ok(address && typeof address !== 'string')

    const url = `http://127.0.0.1:${address.port}`

    async function login(candidate: unknown) {
      return fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: candidate }),
      })
    }

    console.log('1. Rejet des identifiants incorrects')

    const invalid = await login('incorrect')
    assert.equal(invalid.status, 401)
    assert.equal(sessions.size, 0)

    console.log('OK : mauvais mot de passe refusé')

    console.log('2. Validation des entrées')

    const malformed = await login(123)
    assert.equal(malformed.status, 400)

    console.log('OK : données invalides refusées')

    console.log('3. Connexion valide')

    const valid = await login(password)
    assert.equal(valid.status, 200)

    const cookie = valid.headers.get('set-cookie')
    assert.ok(cookie)

    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /Secure/)
    assert.match(cookie, /SameSite=Strict/)

    assert.equal(sessions.size, 1)

    console.log('OK : connexion et cookie sécurisé')

    console.log('4. Accès sans session')

    const anonymous = await fetch(`${url}/auth/me`)
    assert.equal(anonymous.status, 401)

    console.log('OK : utilisateur anonyme refusé')

    console.log('5. Accès avec session')

    const sessionCookie = cookie.split(';', 1)[0]

    const authenticated = await fetch(`${url}/auth/me`, {
      headers: { Cookie: sessionCookie },
    })

    assert.equal(authenticated.status, 200)
    assert.deepEqual(await authenticated.json(), {
      authenticated: true,
    })

    console.log('OK : session valide reconnue')

    console.log('6. Déconnexion')

    const logout = await fetch(`${url}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    })

    assert.equal(logout.status, 204)
    assert.equal(sessions.size, 0)

    console.log('OK : session révoquée')

    console.log('7. Ancienne session inutilisable')

    const revoked = await fetch(`${url}/auth/me`, {
      headers: { Cookie: sessionCookie },
    })

    assert.equal(revoked.status, 401)

    console.log('OK : session révoquée refusée')

    console.log('8. Sauvegardes non exposées')

    const backups = await fetch(`${url}/backups/export`, {
      method: 'POST',
    })

    assert.equal(backups.status, 501)

    console.log('OK : sauvegardes toujours fermées')

    console.log('=== PARCOURS AUTHENTIFICATION VALIDE ===')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  }
})
