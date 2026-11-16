import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BACKUP_TABLES,
  validateBackup,
} from '../src/backupValidation.js'

function fixture() {
  const tables: Record<string, Record<string, unknown>[]> =
    Object.fromEntries(
      BACKUP_TABLES.map(name => [name, []]),
    )

  tables.orders.push({
    id: 'order-c10',
    createdAt: '2026-11-16T10:00:00.000Z',
    status: 'completed',
    items: [{
      id: 'item-c10',
      productId: 'product-c10',
      name: 'Produit test',
      quantity: 1,
      options: [],
    }],
    comment: '',
    consumptionMode: 'emporter',
    knownTotalCents: 1000,
    totalComplete: true,
  })

  tables.salesValuations.push({
    id: 'sale-c10',
    orderId: 'order-c10',
    createdAt: '2026-11-16T10:01:00.000Z',
    status: 'locked',
    totalTtcCents: 1000,
    consumptionMode: 'emporter',
    lines: [{
      itemId: 'item-c10',
      productId: 'product-c10',
      label: 'Produit test',
      quantity: 1,
      unitTtcCents: 1000,
      lineTtcCents: 1000,
      source: 'catalog',
      taxRateBasisPoints: 0,
      netCents: 1000,
      taxCents: 0,
    }],
    taxBreakdown: [{
      rateBasisPoints: 0,
      totalTtcCents: 1000,
      totalHtCents: 1000,
      taxCents: 0,
    }],
  })

  tables.payments.push({
    id: 'payment-c10',
    createdAt: '2026-11-16T10:02:00.000Z',
    method: 'cash',
    amountCents: 500,
    receivedCents: 500,
    changeCents: 0,
  })

  tables.paymentAllocations.push({
    id: 'allocation-c10',
    paymentId: 'payment-c10',
    orderId: 'order-c10',
    amountCents: 500,
  })

  return {
    formatVersion: 2,
    capturedAt: '2026-11-16T10:03:00.000Z',
    tables,
  }
}

test('C10 : sauvegarde cohérente acceptée', () => {
  assert.doesNotThrow(() => validateBackup(fixture()))
})

test('C10 : surpaiement refusé par le serveur', () => {
  const snapshot = fixture()
  snapshot.tables.salesValuations[0].totalTtcCents = 400

  assert.throws(
    () => validateBackup(snapshot),
    /Paiement ou solde de vente incohérent/,
  )
})

test('C10 : valorisations dupliquées refusées', () => {
  const snapshot = fixture()

  snapshot.tables.salesValuations.push({
    ...snapshot.tables.salesValuations[0],
    id: 'sale-duplicate',
  })

  assert.throws(
    () => validateBackup(snapshot),
    /Valorisations dupliquées/,
  )
})

test('C10 : paiement sans valorisation refusé', () => {
  const snapshot = fixture()
  snapshot.tables.salesValuations = []

  assert.throws(
    () => validateBackup(snapshot),
    /Paiement ou solde de vente incohérent/,
  )
})

test('C10 : paiement sur vente non verrouillée refusé', () => {
  const snapshot = fixture()
  snapshot.tables.salesValuations[0].status = 'draft'

  assert.throws(
    () => validateBackup(snapshot),
    /Paiement ou solde de vente incohérent/,
  )
})

test('C10 : V1 reste compatible', () => {
  const snapshot = fixture()
  snapshot.formatVersion = 1

  for (const name of [
    'salesValuations',
    'payments',
    'paymentAllocations',
    'taxConfigurations',
  ]) {
    delete snapshot.tables[name]
  }

  assert.doesNotThrow(() => validateBackup(snapshot))
})
