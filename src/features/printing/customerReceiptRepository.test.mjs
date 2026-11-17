import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assembleCustomerReceipt,
} from './customerReceiptRepository.ts'

const order = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-11-17T12:00:00.000Z',
  status: 'completed',
  items: [],
  comment: '',
  consumptionMode: 'emporter',
  knownTotalCents: 1100,
  totalComplete: true,
}

const sale = {
  id: 'sale-1',
  orderId: order.id,
  createdAt: order.createdAt,
  status: 'locked',
  totalTtcCents: 1100,
  consumptionMode: 'emporter',
  lines: [{
    itemId: 'item-1',
    productId: 'product-1',
    label: 'Panini',
    quantity: 2,
    unitTtcCents: 550,
    lineTtcCents: 1100,
    source: 'manual',
    taxRateBasisPoints: 1000,
    netCents: 1000,
    taxCents: 100,
  }],
  taxBreakdown: [{
    rateBasisPoints: 1000,
    totalTtcCents: 1100,
    totalHtCents: 1000,
    taxCents: 100,
  }],
}

const payment = {
  id: 'payment-1',
  createdAt: order.createdAt,
  method: 'cash',
  amountCents: 600,
}

const allocation = {
  id: 'allocation-1',
  paymentId: payment.id,
  orderId: order.id,
  amountCents: 600,
}

test('vente verrouillee : ticket reconstitue', () => {
  const result = assembleCustomerReceipt(
    order,
    [sale],
    [allocation],
    [payment],
  )

  assert.match(result, /TOTAL TTC/)
  assert.match(result, /ENCAISSE : 6,00/)
  assert.match(result, /RESTE DU : 5,00/)
})

test('absence de valorisation : aucun ticket', () => {
  assert.equal(
    assembleCustomerReceipt(order, [], [], []),
    null,
  )
})

test('vente provisoire : aucun ticket', () => {
  assert.equal(
    assembleCustomerReceipt(
      order,
      [{ ...sale, status: 'draft' }],
      [],
      [],
    ),
    null,
  )
})

test('valorisations multiples refusees', () => {
  assert.throws(
    () => assembleCustomerReceipt(
      order,
      [sale, { ...sale, id: 'sale-2' }],
      [],
      [],
    ),
    /Valorisations multiples/,
  )
})

test('paiement absent refuse', () => {
  assert.throws(
    () => assembleCustomerReceipt(
      order,
      [sale],
      [allocation],
      [undefined],
    ),
    /Paiement référencé introuvable/,
  )
})

test('commande absente refusee', () => {
  assert.throws(
    () => assembleCustomerReceipt(
      undefined,
      [sale],
      [],
      [],
    ),
    /Commande introuvable/,
  )
})
