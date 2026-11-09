import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'

import {
  BACKUP_TABLES,
  BackupValidationError,
  MAX_BACKUP_BYTES,
  validateBackup,
} from '../src/backupValidation.ts'

function snapshot() {
  return {
    formatVersion: 1,
    capturedAt: '2026-11-09T10:00:00.000Z',
    tables: Object.fromEntries(
      BACKUP_TABLES.map(name => [name, []]),
    ) as Record<string, Record<string, unknown>[]>,
  }
}

function order() {
  return {
    id: 'order-test',
    createdAt: '2026-11-09T10:00:00.000Z',
    status: 'validated',
    items: [{ id: 'item-test', quantity: 1 }],
    comment: '',
    consumptionMode: 'emporter',
    knownTotalCents: 500,
    totalComplete: true,
  }
}

test('les neuf tables sont requises', () => {
  assert.equal(BACKUP_TABLES.length, 9)

  const value = snapshot()

  assert.doesNotThrow(() => validateBackup(value))

  delete value.tables.orders

  assert.throws(
    () => validateBackup(value),
    BackupValidationError,
  )
})

test('commande valide et empreinte SHA-256', () => {
  const value = snapshot()
  value.tables.orders.push(order())

  const result = validateBackup(value)

  const expected = createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')

  assert.equal(result.sha256, expected)
  assert.equal(result.bytes, Buffer.byteLength(
    JSON.stringify(value),
  ))
})

test('version inconnue refusée', () => {
  const value = snapshot()
  value.formatVersion = 999

  assert.throws(
    () => validateBackup(value),
    /Version/,
  )
})

test('table inconnue refusée', () => {
  const value = snapshot()
  value.tables.other = []

  assert.throws(
    () => validateBackup(value),
    /Liste des tables/,
  )
})

test('identifiants dupliqués refusés', () => {
  const value = snapshot()

  value.tables.products.push(
    { id: 'same' },
    { id: 'same' },
  )

  assert.throws(
    () => validateBackup(value),
    /dupliqué/,
  )
})

test('paramètres identifiés par leur clé', () => {
  const value = snapshot()

  value.tables.settings.push({
    key: 'example',
    value: 'test',
  })

  assert.doesNotThrow(() => validateBackup(value))
})

test('commande sans articles refusée', () => {
  const value = snapshot()

  value.tables.orders.push({
    ...order(),
    items: [],
  })

  assert.throws(
    () => validateBackup(value),
    /Articles/,
  )
})

test('montant négatif refusé', () => {
  const value = snapshot()

  value.tables.orders.push({
    ...order(),
    knownTotalCents: -1,
  })

  assert.throws(
    () => validateBackup(value),
    /Montant/,
  )
})

test('date impossible refusée', () => {
  const value = snapshot()
  value.capturedAt = '2026-02-30T10:00:00.000Z'

  assert.throws(
    () => validateBackup(value),
    /Date/,
  )
})

test('structure principale supplémentaire refusée', () => {
  const value = {
    ...snapshot(),
    unexpected: true,
  }

  assert.throws(
    () => validateBackup(value),
    /Structure principale/,
  )
})

test('limite de taille appliquée', () => {
  const value = snapshot()

  value.tables.products.push({
    id: 'large',
    description: 'x'.repeat(MAX_BACKUP_BYTES),
  })

  assert.throws(
    () => validateBackup(value),
    /volumineuse/,
  )
})

test('instantané vide accepté', () => {
  const result = validateBackup(snapshot())

  assert.equal(result.snapshot.formatVersion, 1)
  assert.match(result.sha256, /^[0-9a-f]{64}$/)
})
