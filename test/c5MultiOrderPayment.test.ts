import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { db } from '../src/shared/database/db'
import {
  recordMultiOrderPayment,
  allocateProportionally,
} from '../src/features/checkout/multiOrderPayment'

const id1 = '11111111-1111-4111-8111-111111111111'
const id2 = '22222222-2222-4222-8222-222222222222'
const id3 = '33333333-3333-4333-8333-333333333333'

async function seed(orderId: string, total: number) {
  await db.table('orders').add({
    id: orderId,
    createdAt: new Date().toISOString(),
    status: 'validated',
    items: [{
      id: `item-${orderId}`,
      productId: 'panini',
      name: 'Panini',
      priceCents: total,
      options: [],
      quantity: 1,
      note: '',
    }],
    comment: '',
    consumptionMode: 'emporter',
    knownTotalCents: total,
    totalComplete: true,
  })

  await db.salesValuations.add({
    id: `sale-${orderId}`,
    orderId,
    createdAt: new Date().toISOString(),
    status: 'draft',
    consumptionMode: 'emporter',
    totalTtcCents: total,
    lines: [{
      itemId: `item-${orderId}`,
      productId: 'panini',
      label: 'Panini',
      quantity: 1,
      unitTtcCents: total,
      lineTtcCents: total,
      source: 'catalog',
      taxRateBasisPoints: 0,
      netCents: total,
      taxCents: 0,
    }],
    taxBreakdown: [{
      rateBasisPoints: 0,
      totalTtcCents: total,
      totalHtCents: total,
      taxCents: 0,
    }],
  })
}

test('C5 : répartition, réessai et monnaie rendue', async () => {
  await db.open()
  await seed('a', 500)
  await seed('b', 700)

  const first = await recordMultiOrderPayment({
    id: id1,
    orderIds: ['a', 'b'],
    method: 'cash',
    tenderedCents: 800,
  })

  assert.deepEqual(
    first.allocations.map(a => [a.orderId, a.amountCents]),
    [['a', 333], ['b', 467]],
  )
  assert.equal(first.remainingByOrder.a, 167)
  assert.equal(first.remainingByOrder.b, 233)
  assert.equal(first.payment.changeCents, 0)

  const retry = await recordMultiOrderPayment({
    id: id1,
    orderIds: ['a', 'b'],
    method: 'cash',
    tenderedCents: 800,
  })

  assert.equal(retry.payment.id, id1)
  assert.equal(await db.payments.count(), 1)
  assert.equal(await db.paymentAllocations.count(), 2)

  await assert.rejects(
    recordMultiOrderPayment({
      id: id1,
      orderIds: ['b', 'a'],
      method: 'cash',
      tenderedCents: 800,
    }),
    /réutilisé différemment/,
  )

  await assert.rejects(
    recordMultiOrderPayment({
      id: id2,
      orderIds: ['b'],
      method: 'card',
      tenderedCents: 400,
    }),
    /Confirmation carte/,
  )

  const card = await recordMultiOrderPayment({
    id: id2,
    orderIds: ['b'],
    method: 'card',
    tenderedCents: 200,
    cardConfirmed: true,
  })

  assert.equal(card.remainingByOrder.b, 33)

  const cash = await recordMultiOrderPayment({
    id: id3,
    orderIds: ['a', 'b'],
    method: 'cash',
    tenderedCents: 1000,
  })

  assert.equal(cash.payment.amountCents, 200)
  assert.equal(cash.payment.changeCents, 800)
  assert.equal(cash.remainingByOrder.b, 0)

  const all = await db.payments.toArray()
  assert.equal(
    all.reduce((sum, payment) => sum + payment.amountCents, 0),
    1200,
  )

  assert.equal(
    (await db.salesValuations.get('sale-a'))?.status,
    'locked',
  )
  assert.equal(
    (await db.salesValuations.get('sale-b'))?.status,
    'locked',
  )

  await assert.rejects(
    recordMultiOrderPayment({
      id: crypto.randomUUID(),
      orderIds: ['a', 'b'],
      method: 'cash',
      tenderedCents: 100,
    }),
    /Aucun montant/,
  )

  db.close()
  await db.delete()
})

test('C5 : sélection invalide et absence de doublon', async () => {
  await db.open()
  await seed('c', 300)

  await assert.rejects(
    recordMultiOrderPayment({
      id: id1,
      orderIds: ['c', 'c'],
      method: 'cash',
      tenderedCents: 100,
    }),
    /invalide/,
  )

  await assert.rejects(
    recordMultiOrderPayment({
      id: id1,
      orderIds: ['c', 'inconnue'],
      method: 'cash',
      tenderedCents: 100,
    }),
    /introuvable/,
  )

  assert.equal(await db.payments.count(), 0)
  assert.equal(await db.paymentAllocations.count(), 0)

  db.close()
  await db.delete()
})


test('C5 : prorata et arrondi déterministe au centime', () => {
  assert.deepEqual(
    allocateProportionally([500, 700], 800),
    [333, 467],
  )
  assert.deepEqual(
    allocateProportionally([1, 1, 1], 2),
    [1, 1, 0],
  )
  assert.deepEqual(
    allocateProportionally([0, 500, 500], 501),
    [0, 251, 250],
  )
  assert.deepEqual(
    allocateProportionally([500, 700], 1200),
    [500, 700],
  )
  assert.throws(
    () => allocateProportionally([100], 101),
    /invalide/,
  )
})
