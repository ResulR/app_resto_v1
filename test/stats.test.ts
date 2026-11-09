import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  calculateRestaurantStats,
} from '../src/features/statistics/stats'

import type {
  ConfirmedOrder,
} from '../src/features/orders/orderRepository'

const now = new Date('2026-11-09T12:00:00.000Z')

function order(
  id: string,
  createdAt: string,
  status: ConfirmedOrder['status'],
  quantity: number,
  complete: boolean,
): ConfirmedOrder {
  return {
    id,
    createdAt,
    status,
    items: [{
      id: `line-${id}`,
      productId: 'panini-poulet',
      name: 'Panini poulet',
      priceCents: 500,
      options: [],
      note: '',
      quantity,
    }],
    comment: '',
    consumptionMode: null,
    knownTotalCents: quantity * 500,
    totalComplete: complete,
  }
}

test('aucune commande : statistiques à zéro', () => {
  const result = calculateRestaurantStats(
    [],
    'all',
    now,
  )

  assert.equal(result.orderCount, 0)
  assert.equal(result.knownTotalCents, 0)
  assert.deepEqual(result.popularProducts, [])
})

test('quantités et commandes distinctes', () => {
  const result = calculateRestaurantStats([
    order('a', now.toISOString(), 'validated', 3, true),
    order('b', now.toISOString(), 'completed', 2, true),
  ], 'all', now)

  assert.equal(result.orderCount, 2)
  assert.equal(result.activeCount, 1)
  assert.equal(result.completedCount, 1)
  assert.equal(result.itemCount, 5)
  assert.equal(result.knownTotalCents, 2500)

  assert.deepEqual(
    result.popularProducts.map(item => item.quantity),
    [5],
  )
})

test('montants incomplets signalés', () => {
  const result = calculateRestaurantStats([
    order('a', now.toISOString(), 'validated', 2, false),
  ], 'today', now)

  assert.equal(result.knownTotalCents, 1000)
  assert.equal(result.incompleteOrderCount, 1)
})

test('périodes : ancien exclu des 7 jours', () => {
  const older = new Date(now)
  older.setDate(older.getDate() - 10)

  const orders = [
    order('old', older.toISOString(), 'completed', 1, true),
    order('new', now.toISOString(), 'validated', 2, true),
  ]

  assert.equal(
    calculateRestaurantStats(orders, '7days', now).orderCount,
    1,
  )

  assert.equal(
    calculateRestaurantStats(orders, '30days', now).orderCount,
    2,
  )
})

test('produits libres regroupés par nom', () => {
  const first = order(
    'a', now.toISOString(), 'validated', 1, true,
  )
  const second = order(
    'b', now.toISOString(), 'completed', 1, true,
  )

  first.items[0].productId = 'free:one'
  first.items[0].name = 'Supplément spécial'
  second.items[0].productId = 'free:two'
  second.items[0].name = 'Supplément spécial'
  second.items[0].quantity = 3

  const result = calculateRestaurantStats(
    [first, second],
    'all',
    now,
  )

  assert.equal(result.popularProducts.length, 1)
  assert.equal(result.popularProducts[0].quantity, 4)
})

test('une commande future n’entre pas dans les totaux', () => {
  const future = new Date(now.getTime() + 86400000)

  const result = calculateRestaurantStats([
    order('future', future.toISOString(), 'validated', 1, true),
  ], 'all', now)

  assert.equal(result.orderCount, 0)
})
