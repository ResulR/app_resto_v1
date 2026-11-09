import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import {
  downloadLatestBackup,
} from '../src/features/backups/backupDownload'
import {
  SNAPSHOT_TABLES,
} from '../src/features/backups/snapshotFormat'

function fixture() {
  const snapshot = {
    formatVersion: 1,
    capturedAt: '2026-11-09T16:39:41.000Z',
    tables: Object.fromEntries(
      SNAPSHOT_TABLES.map(name => [name, []]),
    ),
  }

  const sha256 = createHash('sha256')
    .update(JSON.stringify(snapshot), 'utf8')
    .digest('hex')

  return {
    id: '12fc960f-64a5-8d29-b151-bba6107495cf',
    formatVersion: 1,
    createdAt: '2026-11-09T16:39:41.000Z',
    sha256,
    snapshot,
  }
}

function mockedFetch(
  status: number,
  value: unknown,
): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(value), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    })) as typeof fetch
}

test('lecture vérifiée de la sauvegarde', async () => {
  const backup = fixture()

  const result = await downloadLatestBackup(
    mockedFetch(200, backup),
  )

  assert.equal(result?.sha256, backup.sha256)
  assert.deepEqual(result?.snapshot, backup.snapshot)
})

test('empreinte incohérente refusée', async () => {
  const backup = fixture()
  backup.sha256 = 'a'.repeat(64)

  await assert.rejects(
    downloadLatestBackup(mockedFetch(200, backup)),
    /Intégrité/,
  )
})

test('snapshot modifié refusé', async () => {
  const backup = fixture()
  backup.snapshot.tables.categories.push({
    id: 'categorie-alteree',
  } as never)

  await assert.rejects(
    downloadLatestBackup(mockedFetch(200, backup)),
    /Intégrité/,
  )
})

test('session absente refusée', async () => {
  await assert.rejects(
    downloadLatestBackup(mockedFetch(401, {})),
    /Connexion administrateur/,
  )
})

test('absence de sauvegarde distincte', async () => {
  const result = await downloadLatestBackup(
    mockedFetch(404, {}),
  )

  assert.equal(result, null)
})

test('réponse sans empreinte refusée', async () => {
  const backup = fixture()
  const withoutHash = {
    id: backup.id,
    formatVersion: backup.formatVersion,
    createdAt: backup.createdAt,
    snapshot: backup.snapshot,
  }

  await assert.rejects(
    downloadLatestBackup(mockedFetch(200, withoutHash)),
    /Métadonnées/,
  )
})
