import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { db } from '../src/shared/database/db'
import {
  recordOrderPayment,
  getOrderRemainingCents,
} from '../src/features/checkout/paymentRepository'
import { saveDraftSaleValuation } from '../src/features/checkout/saleValuation'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const thirdId = '33333333-3333-4333-8333-333333333333'

test('C4 : préparation de la vente', async () => {
  await db.open()

  await db.table('orders').add({
    id: 'order-c4',
    createdAt: '2026-11-16T10:00:00.000Z',
    status: 'validated',
    items: [{
      id: 'item-c4',
      productId: 'panini',
      name: 'Panini',
      priceCents: 1000,
      quantity: 1,
      options: [],
      note: '',
    }],
    comment: '',
    consumptionMode: 'emporter',
    knownTotalCents: 1000,
    totalComplete: true,
  })

  await db.salesValuations.add({
    id: 'sale-c4',
    orderId: 'order-c4',
    createdAt: '2026-11-16T10:00:00.000Z',
    status: 'draft',
    consumptionMode: 'emporter',
    totalTtcCents: 1000,
    lines: [{
      itemId: 'item-c4',
      productId: 'panini',
      label: 'Panini',
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

  assert.equal(
    await getOrderRemainingCents('order-c4'),
    1000,
  )
})

test('C4 : carte non confirmée refusée', async () => {
  await assert.rejects(
    recordOrderPayment({
      id: firstId,
      orderId: 'order-c4',
      method: 'card',
      tenderedCents: 500,
    }),
    /Confirmation carte obligatoire/,
  )

  assert.equal(await db.payments.count(), 0)
})

test('C4 : espèces partielles, sans monnaie rendue', async () => {
  const result = await recordOrderPayment({
    id: firstId,
    orderId: 'order-c4',
    method: 'cash',
    tenderedCents: 400,
  })

  assert.equal(result.payment.amountCents, 400)
  assert.equal(result.payment.receivedCents, 400)
  assert.equal(result.payment.changeCents, 0)
  assert.equal(result.remainingCents, 600)

  assert.equal(
    (await db.salesValuations.get('sale-c4'))?.status,
    'locked',
  )

  await assert.rejects(
    saveDraftSaleValuation('order-c4'),
    /encaissée|verrouillée/,
  )
})

test('C4 : réessai idempotent, aucune duplication', async () => {
  const retry = await recordOrderPayment({
    id: firstId,
    orderId: 'order-c4',
    method: 'cash',
    tenderedCents: 400,
  })

  assert.equal(retry.payment.id, firstId)
  assert.equal(await db.payments.count(), 1)
  assert.equal(await db.paymentAllocations.count(), 1)
  assert.equal(retry.remainingCents, 600)

  await assert.rejects(
    recordOrderPayment({
      id: firstId,
      orderId: 'order-c4',
      method: 'cash',
      tenderedCents: 500,
    }),
    /déjà utilisé différemment/,
  )
})

test('C4 : carte partielle confirmée', async () => {
  const result = await recordOrderPayment({
    id: secondId,
    orderId: 'order-c4',
    method: 'card',
    tenderedCents: 200,
    cardConfirmed: true,
  })

  assert.equal(result.payment.cardConfirmed, true)
  assert.equal(result.remainingCents, 400)
})

test('C4 : espèces avec monnaie rendue', async () => {
  const result = await recordOrderPayment({
    id: thirdId,
    orderId: 'order-c4',
    method: 'cash',
    tenderedCents: 1000,
  })

  assert.equal(result.payment.receivedCents, 1000)
  assert.equal(result.payment.amountCents, 400)
  assert.equal(result.payment.changeCents, 600)
  assert.equal(result.remainingCents, 0)

  const credited = (await db.payments.toArray()).reduce(
    (sum, payment) => sum + payment.amountCents,
    0,
  )

  assert.equal(credited, 1000)
  assert.equal(
    await getOrderRemainingCents('order-c4'),
    0,
  )
})

test('C4 : paiement supplémentaire refusé', async () => {
  await assert.rejects(
    recordOrderPayment({
      id: crypto.randomUUID(),
      orderId: 'order-c4',
      method: 'cash',
      tenderedCents: 100,
    }),
    /déjà réglée/,
  )

  assert.equal(await db.payments.count(), 3)

  // Les articles de la commande originale sont préservés.
  const order = await db.table('orders').get('order-c4')
  assert.equal(order.items[0].priceCents, 1000)

  db.close()
  await db.delete()
})
