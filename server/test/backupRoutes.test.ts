import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Pool } from 'pg'

import { createApp } from '../src/app.ts'

const TOKEN = 'a'.repeat(64)

function makeSnapshot() {
  const names = [
    'categories',
    'products',
    'variants',
    'optionGroups',
    'productOptionGroups',
    'options',
    'drafts',
    'orders',
    'settings',
  ]

  return {
    formatVersion: 1,
    capturedAt: '2026-11-09T10:00:00.000Z',
    tables: Object.fromEntries(
      names.map(name => [name, []]),
    ),
  }
}

function envelope(snapshot: ReturnType<typeof makeSnapshot>) {
  const sha256 = createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex')

  return { snapshot, sha256 }
}

test('réception authentifiée et idempotente', async () => {
  const stored = new Set<string>()
  let sessionValid = true
  let insertCount = 0

  const mockPool = {
    async query(sql: string, params: unknown[]) {
      if (sql.includes('FROM restaurant_sessions')) {
        return {
          rowCount: sessionValid ? 1 : 0,
          rows: sessionValid ? [{ id: 'session' }] : [],
        }
      }

      if (sql.includes('INSERT INTO restaurant_backups')) {
        const id = String(params[0])

        if (stored.has(id)) {
          return { rowCount: 0, rows: [] }
        }

        stored.add(id)
        insertCount++

        return {
          rowCount: 1,
          rows: [{ id }],
        }
      }

      throw new Error('Requête inattendue')
    },
  } as unknown as Pool

  const app = createApp(mockPool)
  const server = app.listen(0, '127.0.0.1')

  try {
    // Attendre que Node ait réellement ouvert le port
    // avant de récupérer l'adresse du serveur.
    if (!server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve)
        server.once('error', reject)
      })
    }

    const address = server.address() as AddressInfo
    const url =
      `http://127.0.0.1:${address.port}/backups/snapshots`

    async function send(
      payload: unknown,
      authenticated = true,
    ) {
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authenticated
            ? { Cookie: `restaurant_session=${TOKEN}` }
            : {}),
        },
        body: JSON.stringify(payload),
      })
    }

    const payload = envelope(makeSnapshot())

    const anonymous = await send(payload, false)
    assert.equal(anonymous.status, 401)
    assert.equal(insertCount, 0)

    sessionValid = false

    const revoked = await send(payload)
    assert.equal(revoked.status, 401)
    assert.equal(insertCount, 0)

    sessionValid = true

    const first = await send(payload)
    assert.equal(first.status, 201)

    const firstResult = await first.json() as {
      id: string
      sha256: string
      stored: boolean
      duplicate: boolean
    }

    assert.equal(firstResult.sha256, payload.sha256)
    assert.equal(firstResult.stored, true)
    assert.equal(firstResult.duplicate, false)

    const second = await send(payload)
    assert.equal(second.status, 200)

    const secondResult = await second.json() as {
      id: string
      duplicate: boolean
    }

    assert.equal(secondResult.id, firstResult.id)
    assert.equal(secondResult.duplicate, true)
    assert.equal(insertCount, 1)

    const badHash = await send({
      ...payload,
      sha256: '0'.repeat(64),
    })

    assert.equal(badHash.status, 422)
    assert.equal(insertCount, 1)

    const malformed = await send({
      snapshot: { formatVersion: 999 },
      sha256: payload.sha256,
    })

    assert.equal(malformed.status, 400)
    assert.equal(insertCount, 1)

    console.log('OK : authentification obligatoire')
    console.log('OK : session révoquée refusée')
    console.log('OK : enregistrement unique')
    console.log('OK : doublons reconnus')
    console.log('OK : SHA-256 vérifié')
    console.log('OK : format invalide refusé')
  } finally {
    // Ne pas masquer une éventuelle erreur initiale
    // par ERR_SERVER_NOT_RUNNING.
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close(error =>
          error ? reject(error) : resolve(),
        )
      })
    }
  }
})
