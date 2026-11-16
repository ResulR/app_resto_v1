import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { db } from '../src/shared/database/db'
import {
  calculateIncludedTax,
  calculateTaxBreakdown,
  saveTaxConfiguration,
  applyTaxToDraftValuation,
} from '../src/features/checkout/saleTax'
import type {
  SaleValuationLine,
} from '../src/shared/database/models'

const line = (
  itemId: string,
  productId: string,
  ttc: number,
): SaleValuationLine => ({
  itemId,
  productId,
  label: productId,
  quantity: 1,
  unitTtcCents: ttc,
  lineTtcCents: ttc,
  source: 'manual',
})

test('C3 : extraction TVA du TTC', () => {
  assert.deepEqual(
    calculateIncludedTax(1060, 600),
    {
      grossCents: 1060,
      netCents: 1000,
      taxCents: 60,
    },
  )

  assert.deepEqual(
    calculateIncludedTax(1120, 1200),
    {
      grossCents: 1120,
      netCents: 1000,
      taxCents: 120,
    },
  )

  assert.deepEqual(
    calculateIncludedTax(1210, 2100),
    {
      grossCents: 1210,
      netCents: 1000,
      taxCents: 210,
    },
  )
})

test('C3 : TVA par produit', () => {
  const result = calculateTaxBreakdown(
    [
      line('a', 'panini', 1060),
      line('b', 'boisson', 1210),
    ],
    new Map([
      ['panini', 600],
      ['boisson', 2100],
    ]),
  )

  assert.equal(result.totalTtcCents, 2270)
  assert.equal(result.taxBreakdown.length, 2)
  assert.equal(
    result.taxBreakdown.reduce(
      (sum, entry) => sum + entry.taxCents,
      0,
    ),
    270,
  )
})

test('C3 : absence de taux refusée', () => {
  assert.throws(
    () => calculateTaxBreakdown(
      [line('a', 'produit', 100)],
      new Map(),
    ),
    /non configurée/,
  )

  assert.throws(
    () => calculateIncludedTax(100, -1),
    /invalide/,
  )
})

test('C3 : taux distinct par consommation', async () => {
  await db.open()

  await saveTaxConfiguration('panini', 'sur_place', 1200)
  await saveTaxConfiguration('panini', 'emporter', 600)

  const configs = await db.taxConfigurations
    .where('productId')
    .equals('panini')
    .toArray()

  assert.equal(configs.length, 2)

  await db.salesValuations.add({
    id: 'valuation-c3',
    orderId: 'order-c3',
    createdAt: '2026-11-16T10:00:00.000Z',
    status: 'draft',
    totalTtcCents: 1120,
    lines: [line('a', 'panini', 1120)],
  })

  const onsite = await applyTaxToDraftValuation(
    'order-c3',
    'sur_place',
  )

  assert.equal(onsite.lines[0].taxRateBasisPoints, 1200)
  assert.equal(onsite.lines[0].taxCents, 120)

  const takeaway = await applyTaxToDraftValuation(
    'order-c3',
    'emporter',
  )

  assert.equal(takeaway.lines[0].taxRateBasisPoints, 600)
  assert.equal(takeaway.totalTtcCents, 1120)

  const originalConfig = await db.taxConfigurations
    .where('[productId+consumptionMode]')
    .equals(['panini', 'sur_place'])
    .first()

  assert.equal(originalConfig?.rateBasisPoints, 1200)

  db.close()
  await db.delete()
})
