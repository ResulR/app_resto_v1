import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import Dexie from 'dexie'

import { db } from '../src/shared/database/db'
import {
  RESTORE_CONFIRMATION,
  restoreToEmptyDatabase,
} from '../src/features/backups/backupRestore'
import {
  LEGACY_SNAPSHOT_TABLES,
  SNAPSHOT_TABLES,
  SNAPSHOT_VERSION,
} from '../src/features/backups/snapshotFormat'

// Simulation de Web Locks pour les tests isolés.
// Aucune connexion au navigateur ou à la production.
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        callback: (lock: object) => Promise<unknown>,
      ) => callback({ name: 'restaurant-c1-test-lock' }),
    },
  },
})

test('C1 : migration V3 vers V4 non destructive', async () => {
  const old = new Dexie('restaurant-pwa')

  old.version(3).stores({
    categories: 'id, position, active',
    products: 'id, categoryId, position, active',
    variants: 'id, productId, position',
    optionGroups: 'id, position',
    productOptionGroups: 'id, productId, groupId, [productId+groupId]',
    options: 'id, groupId, position, active',
    drafts: 'id, updatedAt',
    orders: 'id, createdAt',
    settings: 'key',
  })

  await old.open()

  const category = {
    id: 'category-1',
    name: 'Paninis',
    position: 0,
    active: true,
  }
  const order = {
    id: 'order-1',
    createdAt: '2026-11-16T10:00:00.000Z',
    status: 'validated',
    items: [{ id: 'item-1', quantity: 1 }],
    comment: '',
    consumptionMode: null,
    knownTotalCents: 0,
    totalComplete: false,
  }

  await old.table('categories').add(category)
  await old.table('orders').add(order)
  old.close()

  await db.open()

  assert.equal(db.verno, 4)
  assert.deepEqual(await db.categories.get(category.id), category)
  assert.deepEqual(await db.table('orders').get(order.id), order)

  for (const name of [
    'salesValuations',
    'payments',
    'paymentAllocations',
    'taxConfigurations',
  ]) {
    assert.equal(await db.table(name).count(), 0)
  }

  db.close()
  await db.delete()
})

test('C1 : restauration V1 vers V2 sans faux paiement', async () => {
  await db.open()
  const tables = Object.fromEntries(
    LEGACY_SNAPSHOT_TABLES.map(name => [name, []]),
  ) as Record<string, Record<string, unknown>[]>

  tables.categories.push({
    id: 'legacy-category',
    name: 'Paninis',
    position: 0,
    active: true,
  })

  const result = await restoreToEmptyDatabase(
    {
      formatVersion: 1,
      capturedAt: '2026-11-16T10:00:00.000Z',
      tables,
    },
    RESTORE_CONFIRMATION,
  )

  assert.equal(result.status, 'restored')
  assert.equal(await db.categories.count(), 1)

  for (const name of [
    'salesValuations',
    'payments',
    'paymentAllocations',
    'taxConfigurations',
  ]) {
    assert.equal(await db.table(name).count(), 0)
  }

  db.close()
  await db.delete()
})

test('C1 : restauration V2 avec écritures de caisse', async () => {
  await db.open()
  const tables = Object.fromEntries(
    SNAPSHOT_TABLES.map(name => [name, []]),
  ) as Record<string, Record<string, unknown>[]>

  tables.orders.push({
    id: 'order-v2',
    createdAt: '2026-11-16T10:00:00.000Z',
    status: 'validated',
    items: [{ id: 'item-v2', quantity: 1 }],
    comment: '',
    consumptionMode: 'emporter',
    knownTotalCents: 1000,
    totalComplete: true,
  })

  tables.salesValuations.push({
    id: 'valuation-v2',
    orderId: 'order-v2',
    createdAt: '2026-11-16T10:00:00.000Z',
    status: 'locked',
    totalTtcCents: 1000,
    consumptionMode: 'emporter',
    lines: [],
  })

  tables.payments.push({
    id: 'payment-v2',
    createdAt: '2026-11-16T10:01:00.000Z',
    method: 'cash',
    amountCents: 1000,
    receivedCents: 1000,
    changeCents: 0,
  })

  tables.paymentAllocations.push({
    id: 'allocation-v2',
    paymentId: 'payment-v2',
    orderId: 'order-v2',
    amountCents: 1000,
  })

  const result = await restoreToEmptyDatabase(
    {
      formatVersion: SNAPSHOT_VERSION,
      capturedAt: '2026-11-16T10:02:00.000Z',
      tables,
    },
    RESTORE_CONFIRMATION,
  )

  assert.equal(result.status, 'restored')
  assert.equal(await db.salesValuations.count(), 1)
  assert.equal(await db.payments.count(), 1)
  assert.equal(await db.paymentAllocations.count(), 1)
  assert.equal(
    (await db.table('orders').get('order-v2'))?.knownTotalCents,
    1000,
  )

  db.close()
  await db.delete()
})
