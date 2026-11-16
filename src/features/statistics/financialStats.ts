import type {
  Payment,
  PaymentAllocation,
  SaleValuation,
} from '../../shared/database/models'
import type {
  ConfirmedOrder,
} from '../orders/orderRepository'

export type FinancialPeriod =
  | 'today'
  | '7days'
  | '30days'
  | 'all'

export interface FinancialStats {
  valuedSalesCount: number
  draftValuationCount: number
  draftValuationTtcCents: number
  lockedValuationCount: number
  lockedValuationTtcCents: number
  unvaluedOrdersCount: number
  salesTtcCents: number
  salesHtCents: number
  salesVatCents: number
  cashReceivedCents: number
  cardReceivedCents: number
  receivedCents: number
  outstandingCents: number
  partiallyPaidCount: number
  unpaidCount: number
  fullyPaidCount: number
}

function validCents(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
}

function inPeriod(
  value: string,
  period: FinancialPeriod,
  now: Date,
): boolean {
  const date = new Date(value)

  if (
    !Number.isFinite(date.getTime()) ||
    date.getTime() > now.getTime()
  ) {
    return false
  }

  if (period === 'all') return true

  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  if (period === '7days') {
    start.setDate(start.getDate() - 6)
  } else if (period === '30days') {
    start.setDate(start.getDate() - 29)
  }

  return date.getTime() >= start.getTime()
}

export function calculateFinancialStats(
  orders: readonly ConfirmedOrder[],
  sales: readonly SaleValuation[],
  payments: readonly Payment[],
  allocations: readonly PaymentAllocation[],
  period: FinancialPeriod,
  now: Date = new Date(),
): FinancialStats {
  const result: FinancialStats = {
    valuedSalesCount: 0,
    draftValuationCount: 0,
    draftValuationTtcCents: 0,
    lockedValuationCount: 0,
    lockedValuationTtcCents: 0,
    unvaluedOrdersCount: 0,
    salesTtcCents: 0,
    salesHtCents: 0,
    salesVatCents: 0,
    cashReceivedCents: 0,
    cardReceivedCents: 0,
    receivedCents: 0,
    outstandingCents: 0,
    partiallyPaidCount: 0,
    unpaidCount: 0,
    fullyPaidCount: 0,
  }

  const ordersById = new Map(orders.map(order => [
    order.id,
    order,
  ]))

  const salesByOrder = new Map<string, SaleValuation>()

  for (const sale of sales) {
    if (
      !ordersById.has(sale.orderId) ||
      salesByOrder.has(sale.orderId)
    ) {
      throw new Error('Valorisations de caisse incohérentes.')
    }
    salesByOrder.set(sale.orderId, sale)
  }

  const paymentsById = new Map<string, Payment>()

  for (const payment of payments) {
    if (
      paymentsById.has(payment.id) ||
      !validCents(payment.amountCents) ||
      payment.amountCents === 0 ||
      !['cash', 'card'].includes(payment.method)
    ) {
      throw new Error('Paiement financier incohérent.')
    }
    paymentsById.set(payment.id, payment)
  }

  const amountsByPayment = new Map<string, number>()
  const amountsByOrder = new Map<string, number>()
  const allocationIds = new Set<string>()

  for (const allocation of allocations) {
    if (
      allocationIds.has(allocation.id) ||
      !paymentsById.has(allocation.paymentId) ||
      !ordersById.has(allocation.orderId) ||
      !validCents(allocation.amountCents) ||
      allocation.amountCents === 0
    ) {
      throw new Error('Répartition financière incohérente.')
    }

    allocationIds.add(allocation.id)

    amountsByPayment.set(
      allocation.paymentId,
      (amountsByPayment.get(allocation.paymentId) ?? 0) +
        allocation.amountCents,
    )

    amountsByOrder.set(
      allocation.orderId,
      (amountsByOrder.get(allocation.orderId) ?? 0) +
        allocation.amountCents,
    )
  }

  for (const payment of payments) {
    if (
      amountsByPayment.get(payment.id) !== payment.amountCents
    ) {
      throw new Error('Paiement non entièrement réparti.')
    }

    if (!inPeriod(payment.createdAt, period, now)) {
      continue
    }

    // Le montant crédité, et non les espèces tendues,
    // constitue l'encaissement réel.
    result.receivedCents += payment.amountCents

    if (payment.method === 'cash') {
      result.cashReceivedCents += payment.amountCents
    } else {
      result.cardReceivedCents += payment.amountCents
    }
  }

  for (const order of orders) {
    const sale = salesByOrder.get(order.id)
    const paid = amountsByOrder.get(order.id) ?? 0

    if (paid > 0 && !sale) {
      throw new Error('Paiement sans valorisation.')
    }

    if (
      sale &&
      (!validCents(sale.totalTtcCents) ||
        paid > sale.totalTtcCents)
    ) {
      throw new Error('Solde financier incohérent.')
    }

    if (!inPeriod(order.createdAt, period, now)) {
      continue
    }

    if (
      !sale ||
      sale.totalTtcCents === undefined ||
      !sale.taxBreakdown?.length
    ) {
      result.unvaluedOrdersCount++
      continue
    }

    const totalHt = sale.taxBreakdown.reduce(
      (sum, group) => sum + group.totalHtCents,
      0,
    )
    const totalVat = sale.taxBreakdown.reduce(
      (sum, group) => sum + group.taxCents,
      0,
    )
    const totalTtc = sale.taxBreakdown.reduce(
      (sum, group) => sum + group.totalTtcCents,
      0,
    )

    if (
      !validCents(totalHt) ||
      !validCents(totalVat) ||
      !validCents(totalTtc) ||
      totalHt + totalVat !== totalTtc ||
      totalTtc !== sale.totalTtcCents
    ) {
      throw new Error('Ventilation TVA incohérente.')
    }

    if (sale.status === 'draft') {
      if (paid !== 0) {
        throw new Error('Paiement sur valorisation provisoire.')
      }
      result.draftValuationCount++
      result.draftValuationTtcCents += sale.totalTtcCents
    } else if (sale.status === 'locked') {
      result.lockedValuationCount++
      result.lockedValuationTtcCents += sale.totalTtcCents
    } else {
      throw new Error('Statut de valorisation invalide.')
    }

    result.valuedSalesCount++
    result.salesTtcCents += sale.totalTtcCents
    result.salesHtCents += totalHt
    result.salesVatCents += totalVat
    result.outstandingCents += sale.totalTtcCents - paid

    if (paid === 0 && sale.totalTtcCents > 0) {
      result.unpaidCount++
    } else if (paid < sale.totalTtcCents) {
      result.partiallyPaidCount++
    } else {
      result.fullyPaidCount++
    }
  }

  for (const amount of [
    result.salesTtcCents,
    result.draftValuationTtcCents,
    result.lockedValuationTtcCents,
    result.salesHtCents,
    result.salesVatCents,
    result.cashReceivedCents,
    result.cardReceivedCents,
    result.receivedCents,
    result.outstandingCents,
  ]) {
    if (!validCents(amount)) {
      throw new Error('Dépassement des montants financiers.')
    }
  }

  return result
}
