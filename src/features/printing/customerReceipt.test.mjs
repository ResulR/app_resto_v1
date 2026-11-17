import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCustomerReceipt } from './customerReceipt.ts'

function fixture() {
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
    amountCents: 3000,
  }

  const allocation = {
    id: 'allocation-1',
    paymentId: payment.id,
    orderId: order.id,
    amountCents: 600,
  }

  return { order, sale, payment, allocation }
}

test('ticket client avec solde partiel et TVA', () => {
  const { order, sale, payment, allocation } = fixture()
  const result = createCustomerReceipt(
    order, sale, [allocation], [payment],
  )

  assert.match(result, /Panini/)
  assert.match(result, /TOTAL TTC/)
  assert.match(result, /11,00/)
  assert.match(result, /ENCAISSE/)
  assert.match(result, /6,00/)
  assert.match(result, /RESTE DU/)
  assert.match(result, /5,00/)
  assert.match(result, /DETAIL TVA/)
  assert.match(result, /non certifie/)
})

test('paiement groupe : seule allocation individuelle comptee', () => {
  const { order, sale, payment, allocation } = fixture()
  const result = createCustomerReceipt(
    order, sale, [allocation], [payment],
  )

  assert.doesNotMatch(result, /30,00/)
  assert.match(result, /6,00/)
})

test('commande impayee : le solde reste entier', () => {
  const { order, sale } = fixture()
  const result = createCustomerReceipt(order, sale, [], [])

  assert.match(result, /0,00/)
  assert.match(result, /11,00/)
})

test('valorisation provisoire refusee', () => {
  const { order, sale } = fixture()
  sale.status = 'draft'

  assert.throws(
    () => createCustomerReceipt(order, sale, [], []),
    /non finalisée/,
  )
})

test('ventilation TVA incoherente refusee', () => {
  const { order, sale } = fixture()
  sale.taxBreakdown[0].taxCents = 101

  assert.throws(
    () => createCustomerReceipt(order, sale, [], []),
    /TVA incohérente/,
  )
})

test('surpaiement refuse', () => {
  const { order, sale, payment, allocation } = fixture()
  allocation.amountCents = 1200

  assert.throws(
    () => createCustomerReceipt(
      order, sale, [allocation], [payment],
    ),
    /supérieur au total/,
  )
})

test('allocation liee a une autre commande refusee', () => {
  const { order, sale, payment, allocation } = fixture()
  allocation.orderId = 'autre-commande'

  assert.throws(
    () => createCustomerReceipt(
      order, sale, [allocation], [payment],
    ),
    /Allocation de paiement incohérente/,
  )
})

test('paiement inconnu refuse', () => {
  const { order, sale, allocation } = fixture()

  assert.throws(
    () => createCustomerReceipt(
      order, sale, [allocation], [],
    ),
    /Allocation de paiement incohérente/,
  )
})

test('allocations cumulees superieures au paiement refusees', () => {
  const { order, sale, payment, allocation } = fixture()

  payment.amountCents = 700
  allocation.amountCents = 400

  const secondAllocation = {
    ...allocation,
    id: 'allocation-2',
    amountCents: 400,
  }

  assert.throws(
    () => createCustomerReceipt(
      order,
      sale,
      [allocation, secondAllocation],
      [payment],
    ),
    /Allocations supérieures au paiement/,
  )
})

test('allocations multiples valides sur un meme paiement', () => {
  const { order, sale, payment, allocation } = fixture()

  payment.amountCents = 700
  allocation.amountCents = 400

  const secondAllocation = {
    ...allocation,
    id: 'allocation-2',
    amountCents: 300,
  }

  const receipt = createCustomerReceipt(
    order,
    sale,
    [allocation, secondAllocation],
    [payment],
  )

  assert.match(receipt, /ENCAISSE : 7,00/)
  assert.match(receipt, /RESTE DU : 4,00/)
})

test('identifiant allocation duplique refuse', () => {
  const { order, sale, payment, allocation } = fixture()

  assert.throws(
    () => createCustomerReceipt(
      order,
      sale,
      [allocation, allocation],
      [payment],
    ),
    /Allocation de paiement incohérente/,
  )
})
