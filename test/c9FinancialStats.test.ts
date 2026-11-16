import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  Payment,
  PaymentAllocation,
  SaleValuation,
} from '../src/shared/database/models'
import type {
  ConfirmedOrder,
} from '../src/features/orders/orderRepository'
import {
  calculateFinancialStats,
} from '../src/features/statistics/financialStats'

const now = new Date('2026-11-16T15:00:00')

function order(
  id: string,
  createdAt: string,
  status: 'validated' | 'completed' = 'validated',
): ConfirmedOrder {
  return {
    id,
    createdAt,
    status,
    items: [],
    comment: '',
    consumptionMode: 'emporter',
    knownTotalCents: 0,
    totalComplete: false,
  }
}

function sale(
  id: string,
  orderId: string,
  ttc: number,
  ht: number,
): SaleValuation {
  return {
    id,
    orderId,
    createdAt: now.toISOString(),
    status: 'locked',
    totalTtcCents: ttc,
    consumptionMode: 'emporter',
    lines: [],
    taxBreakdown: [{
      rateBasisPoints: 0,
      totalTtcCents: ttc,
      totalHtCents: ht,
      taxCents: ttc - ht,
    }],
  }
}

function payment(
  id: string,
  amount: number,
  method: 'cash' | 'card',
  createdAt: string,
): Payment {
  return {
    id,
    amountCents: amount,
    method,
    createdAt,
    ...(method === 'cash'
      ? {
          receivedCents: amount + 500,
          changeCents: 500,
        }
      : { cardConfirmed: true }),
  }
}

const orders = [
  order('a', '2026-11-16T09:00:00', 'completed'),
  order('b', '2026-11-16T10:00:00'),
  order('c', '2026-11-16T11:00:00'),
]

const sales = [
  sale('sa', 'a', 500, 450),
  sale('sb', 'b', 700, 600),
]

const payments = [
  payment('p1', 800, 'cash', '2026-11-16T12:00:00'),
  payment('p2', 200, 'card', '2026-11-16T13:00:00'),
]

const allocations: PaymentAllocation[] = [
  { id: 'a1', paymentId: 'p1', orderId: 'a', amountCents: 333 },
  { id: 'a2', paymentId: 'p1', orderId: 'b', amountCents: 467 },
  { id: 'a3', paymentId: 'p2', orderId: 'b', amountCents: 200 },
]

test('C9 : séparer ventes, encaissé et impayés', () => {
  const stats = calculateFinancialStats(
    orders,
    sales,
    payments,
    allocations,
    'today',
    now,
  )

  assert.equal(stats.valuedSalesCount, 2)
  assert.equal(stats.unvaluedOrdersCount, 1)
  assert.equal(stats.salesTtcCents, 1200)
  assert.equal(stats.salesHtCents, 1050)
  assert.equal(stats.salesVatCents, 150)
  assert.equal(stats.receivedCents, 1000)
  assert.equal(stats.cashReceivedCents, 800)
  assert.equal(stats.cardReceivedCents, 200)
  assert.equal(stats.outstandingCents, 200)
  assert.equal(stats.partiallyPaidCount, 2)
  assert.equal(stats.unpaidCount, 0)
  assert.equal(stats.fullyPaidCount, 0)
})

test('C9 : monnaie rendue exclue des encaissements', () => {
  const stats = calculateFinancialStats(
    orders,
    sales,
    payments,
    allocations,
    'all',
    now,
  )

  assert.equal(stats.receivedCents, 1000)
  assert.notEqual(stats.receivedCents, 1500)
})

test('C9 : encaissement ultérieur sans doubler la vente', () => {
  const oldOrders = [
    order('old', '2026-11-01T10:00:00', 'completed'),
  ]
  const oldSales = [sale('old-sale', 'old', 400, 360)]
  const recentPayments = [
    payment('recent', 400, 'card', '2026-11-16T11:00:00'),
  ]
  const recentAllocations = [{
    id: 'recent-allocation',
    orderId: 'old',
    paymentId: 'recent',
    amountCents: 400,
  }]

  const stats = calculateFinancialStats(
    oldOrders,
    oldSales,
    recentPayments,
    recentAllocations,
    'today',
    now,
  )

  assert.equal(stats.salesTtcCents, 0)
  assert.equal(stats.receivedCents, 400)
  assert.equal(stats.outstandingCents, 0)
})

test('C9 : un paiement réparti est compté une fois', () => {
  const stats = calculateFinancialStats(
    orders,
    sales,
    [payments[0]],
    allocations.slice(0, 2),
    'today',
    now,
  )

  assert.equal(stats.receivedCents, 800)
  assert.equal(stats.outstandingCents, 400)
})

test('C9 : paiement incohérent refusé', () => {
  assert.throws(
    () => calculateFinancialStats(
      orders,
      sales,
      payments,
      allocations.slice(0, 2),
      'all',
      now,
    ),
    /non entièrement réparti/,
  )
})

test('C9 : aucun paiement ne signifie pas vente encaissée', () => {
  const stats = calculateFinancialStats(
    [order('free-of-payment', '2026-11-16T09:00:00', 'completed')],
    [sale('unpaid-sale', 'free-of-payment', 300, 270)],
    [],
    [],
    'today',
    now,
  )

  assert.equal(stats.salesTtcCents, 300)
  assert.equal(stats.receivedCents, 0)
  assert.equal(stats.outstandingCents, 300)
  assert.equal(stats.unpaidCount, 1)
})
