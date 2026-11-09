import 'fake-indexeddb/auto'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { db } from '../src/shared/database/db'
import {
  RESTORE_CONFIRMATION,
  restoreToEmptyDatabase,
} from '../src/features/backups/backupRestore'
import {
  SNAPSHOT_TABLES,
  SNAPSHOT_VERSION,
  type RestaurantSnapshot,
  type SnapshotRow,
} from '../src/features/backups/snapshotFormat'

// Verrou navigateur simulé uniquement dans ce processus
// de test. Aucune connexion au VPS ni au navigateur réel.
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        callback: (lock: object) => Promise<unknown>,
      ) => callback({ name: 'restaurant-test-lock' }),
    },
  },
})

function snapshot(): RestaurantSnapshot {
  const tables = Object.fromEntries(
    SNAPSHOT_TABLES.map(name => [name, []]),
  ) as RestaurantSnapshot['tables']

  for (const name of SNAPSHOT_TABLES) {
    if (name === 'settings') {
      tables.settings = [{
        key: 'restore-test',
        value: 'ok',
      }]
    } else {
      tables[name] = [{
        id: `restored-${name}`,
      }] as SnapshotRow[]
    }
  }

  return {
    formatVersion: SNAPSHOT_VERSION,
    capturedAt: '2026-11-09T16:00:00.000Z',
    tables,
  }
}

async function counts() {
  return Promise.all(
    SNAPSHOT_TABLES.map(
      name => db.table(name).count(),
    ),
  )
}

test('restauration atomique sur base vierge', async () => {
  const result = await restoreToEmptyDatabase(
    snapshot(),
    RESTORE_CONFIRMATION,
  )

  assert.deepEqual(result, {
    status: 'restored',
    rowCount: SNAPSHOT_TABLES.length,
  })

  assert.deepEqual(
    await counts(),
    SNAPSHOT_TABLES.map(() => 1),
  )

  const saved = await db.settings.get('restore-test')
  assert.equal(saved?.value, 'ok')
})

test('base non vide : aucun écrasement', async () => {
  const before = await Promise.all(
    SNAPSHOT_TABLES.map(
      name => db.table(name).toArray(),
    ),
  )

  await assert.rejects(
    restoreToEmptyDatabase(
      snapshot(),
      RESTORE_CONFIRMATION,
    ),
    /contient déjà des données/,
  )

  const after = await Promise.all(
    SNAPSHOT_TABLES.map(
      name => db.table(name).toArray(),
    ),
  )

  assert.deepEqual(after, before)
})

test('confirmation incorrecte : aucune écriture', async () => {
  const before = await counts()

  await assert.rejects(
    restoreToEmptyDatabase(snapshot(), 'NON'),
    /Confirmation explicite/,
  )

  assert.deepEqual(await counts(), before)
})

test('version inconnue : aucune écriture', async () => {
  const invalid = snapshot()
  invalid.formatVersion = 999

  const before = await counts()

  await assert.rejects(
    restoreToEmptyDatabase(
      invalid,
      RESTORE_CONFIRMATION,
    ),
    /Version de sauvegarde incompatible/,
  )

  assert.deepEqual(await counts(), before)
})

test('fin du test isolé', async () => {
  db.close()
})
