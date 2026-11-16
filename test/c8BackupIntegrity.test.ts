import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  SNAPSHOT_TABLES,
  validateSnapshot,
  type RestaurantSnapshot,
  type SnapshotTables,
} from '../src/features/backups/snapshotFormat'
import {
  hasRestaurantData,
} from '../src/features/backups/backupContent'

function emptySnapshot(): RestaurantSnapshot {
  const tables = Object.fromEntries(
    SNAPSHOT_TABLES.map(name => [name, []]),
  ) as SnapshotTables

  return {
    formatVersion: 2,
    capturedAt: '2026-11-16T10:00:00.000Z',
    tables,
  }
}

function filledSnapshot(): RestaurantSnapshot {
  const snapshot = emptySnapshot()
  const tables = snapshot.tables as SnapshotTables

  tables.orders.push({
    id: 'order-c8',
    createdAt: '2026-11-16T10:00:00.000Z',
    status: 'completed',
    items: [{ id: 'item-c8', quantity: 1 }],
  })

  tables.salesValuations.push({
    id: 'valuation-c8',
    orderId: 'order-c8',
    createdAt: '2026-11-16T10:00:00.000Z',
    status: 'locked',
    totalTtcCents: 1000,
    lines: [],
  })

  tables.payments.push({
    id: 'payment-c8',
    createdAt: '2026-11-16T10:01:00.000Z',
    method: 'cash',
    amountCents: 500,
    receivedCents: 500,
    changeCents: 0,
  })

  tables.paymentAllocations.push({
    id: 'allocation-c8',
    paymentId: 'payment-c8',
    orderId: 'order-c8',
    amountCents: 500,
  })

  return snapshot
}

test('C8 : les seules écritures V2 ne sont pas ignorées', () => {
  const snapshot = emptySnapshot()
  const tables = snapshot.tables as SnapshotTables

  assert.equal(hasRestaurantData(snapshot), false)

  tables.settings.push({ key: 'theme', value: 'clair' })
  assert.equal(hasRestaurantData(snapshot), false)

  tables.taxConfigurations.push({
    id: 'tax-c8',
    productId: 'panini',
    consumptionMode: 'emporter',
    rateBasisPoints: 600,
    updatedAt: '2026-11-16T10:00:00.000Z',
  })

  assert.equal(hasRestaurantData(snapshot), true)
})

test('C8 : paiement partiel cohérent accepté', () => {
  const snapshot = filledSnapshot()
  assert.doesNotThrow(() => validateSnapshot(snapshot))
})

test('C8 : commande surpayée refusée', () => {
  const snapshot = filledSnapshot()
  const tables = snapshot.tables as SnapshotTables

  tables.salesValuations[0].totalTtcCents = 400

  assert.throws(
    () => validateSnapshot(snapshot),
    /surpayée/,
  )
})

test('C8 : valorisations dupliquées refusées', () => {
  const snapshot = filledSnapshot()
  const tables = snapshot.tables as SnapshotTables

  tables.salesValuations.push({
    ...tables.salesValuations[0],
    id: 'valuation-c8-duplicate',
  })

  assert.throws(
    () => validateSnapshot(snapshot),
    /dupliquées/,
  )
})

test('C8 : allocation orpheline refusée', () => {
  const snapshot = filledSnapshot()
  const tables = snapshot.tables as SnapshotTables

  tables.paymentAllocations[0].paymentId = 'missing'

  assert.throws(
    () => validateSnapshot(snapshot),
    /Allocation invalide/,
  )
})
