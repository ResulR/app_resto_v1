import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  groupCompletedOrders,
  historyCutoff,
} from '../src/features/orders/orderArchivePolicy'
import type {
  ConfirmedOrder,
} from '../src/features/orders/orderRepository'

function order(
  id: string,
  completedAt: string | undefined,
  status: ConfirmedOrder['status'] = 'completed',
): ConfirmedOrder {
  return {
    id,
    createdAt: '2026-09-01T12:00:00.000Z',
    completedAt,
    status,
    items: [],
    comment: '',
    consumptionMode: null,
    knownTotalCents: 0,
    totalComplete: true,
  }
}

test('les trente jours calendaires incluent aujourd’hui', () => {
  const now = new Date('2026-11-09T12:00:00')
  const cutoff = new Date(historyCutoff(now))

  assert.equal(cutoff.getHours(), 0)
  assert.equal(cutoff.getMinutes(), 0)
  assert.equal(cutoff.getDate(), 11)
  assert.equal(cutoff.getMonth(), 9)
})

test('commande récente et ancienne séparées', () => {
  const now = new Date('2026-11-09T12:00:00')

  const groups = groupCompletedOrders([
    order('recent', '2026-11-08T15:00:00'),
    order('old', '2026-09-15T15:00:00'),
  ], now)

  assert.deepEqual(groups.recent.map(x => x.id), ['recent'])
  assert.deepEqual(groups.archive.map(x => x.id), ['old'])
})

test('date de fin absente utilise la date de création', () => {
  const row = order('fallback', undefined)
  row.createdAt = '2026-11-09T09:00:00'

  const groups = groupCompletedOrders(
    [row],
    new Date('2026-11-09T12:00:00'),
  )

  assert.equal(groups.recent.length, 1)
})

test('commande active exclue', () => {
  const groups = groupCompletedOrders(
    [order('active', '2026-11-09T09:00:00', 'validated')],
    new Date('2026-11-09T12:00:00'),
  )

  assert.equal(groups.recent.length, 0)
  assert.equal(groups.archive.length, 0)
})

test('date invalide conservée en archive', () => {
  const groups = groupCompletedOrders(
    [order('invalid', 'invalid-date')],
    new Date('2026-11-09T12:00:00'),
  )

  assert.equal(groups.archive[0]?.id, 'invalid')
})

test('classement non destructif', () => {
  const rows = [
    order('a', '2026-11-08T15:00:00'),
    order('b', '2026-09-08T15:00:00'),
  ]
  const original = structuredClone(rows)

  groupCompletedOrders(
    rows,
    new Date('2026-11-09T12:00:00'),
  )

  assert.deepEqual(rows, original)
})
