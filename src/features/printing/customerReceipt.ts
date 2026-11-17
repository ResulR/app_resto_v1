import type {
  Payment,
  PaymentAllocation,
  SaleValuation,
} from '../../shared/database/models'
import type { ConfirmedOrder } from '../orders/orderRepository'

const MAX_CENTS = 100000000

function validCents(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_CENTS
}

function euros(cents: number): string {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function createCustomerReceipt(
  order: ConfirmedOrder,
  sale: SaleValuation,
  allocations: readonly PaymentAllocation[],
  payments: readonly Payment[],
): string {
  const date = new Date(order.createdAt)

  if (!Number.isFinite(date.getTime())) {
    throw new Error('Date de commande invalide.')
  }

  if (
    sale.orderId !== order.id ||
    sale.status !== 'locked' ||
    !validCents(sale.totalTtcCents) ||
    !sale.lines.length ||
    !sale.taxBreakdown?.length
  ) {
    throw new Error('Vente non finalisée ou incomplète.')
  }

  const total = sale.totalTtcCents
  let linesTotal = 0
  const byRate = new Map<number, {
    gross: number
    net: number
    vat: number
  }>()

  for (const line of sale.lines) {
    if (
      !line.label?.trim() ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      !validCents(line.unitTtcCents) ||
      !validCents(line.lineTtcCents) ||
      !validCents(line.netCents) ||
      !validCents(line.taxCents) ||
      !Number.isSafeInteger(line.taxRateBasisPoints) ||
      line.taxRateBasisPoints! < 0 ||
      line.taxRateBasisPoints! > 10000 ||
      line.unitTtcCents * line.quantity !== line.lineTtcCents ||
      line.netCents + line.taxCents !== line.lineTtcCents
    ) {
      throw new Error('Ligne de vente incohérente.')
    }

    linesTotal += line.lineTtcCents
    const rate = line.taxRateBasisPoints!
    const group = byRate.get(rate) ?? {
      gross: 0, net: 0, vat: 0,
    }
    group.gross += line.lineTtcCents
    group.net += line.netCents
    group.vat += line.taxCents
    byRate.set(rate, group)
  }

  if (linesTotal !== total) {
    throw new Error('Total de vente incohérent.')
  }

  const rates = new Set<number>()
  let taxGross = 0

  for (const row of sale.taxBreakdown) {
    const group = byRate.get(row.rateBasisPoints)

    if (
      rates.has(row.rateBasisPoints) ||
      !group ||
      !validCents(row.totalTtcCents) ||
      !validCents(row.totalHtCents) ||
      !validCents(row.taxCents) ||
      row.totalTtcCents !== group.gross ||
      row.totalHtCents !== group.net ||
      row.taxCents !== group.vat
    ) {
      throw new Error('Ventilation TVA incohérente.')
    }

    rates.add(row.rateBasisPoints)
    taxGross += row.totalTtcCents
  }

  if (rates.size !== byRate.size || taxGross !== total) {
    throw new Error('Total TVA incohérent.')
  }

  const paymentById = new Map<string, Payment>()

  for (const payment of payments) {
    if (
      paymentById.has(payment.id) ||
      !validCents(payment.amountCents)
    ) {
      throw new Error('Référence de paiement invalide.')
    }
    paymentById.set(payment.id, payment)
  }

  let paid = 0
  const seenAllocations = new Set<string>()
  const allocatedByPayment = new Map<string, number>()

  for (const allocation of allocations) {
    const payment = paymentById.get(allocation.paymentId)

    if (
      seenAllocations.has(allocation.id) ||
      allocation.orderId !== order.id ||
      !payment ||
      !validCents(allocation.amountCents) ||
      allocation.amountCents > payment.amountCents
    ) {
      throw new Error('Allocation de paiement incohérente.')
    }

    const previouslyAllocated =
      allocatedByPayment.get(allocation.paymentId) ?? 0

    const nextAllocated =
      previouslyAllocated + allocation.amountCents

    if (
      !Number.isSafeInteger(nextAllocated) ||
      nextAllocated > payment.amountCents
    ) {
      throw new Error(
        'Allocations supérieures au paiement enregistré.',
      )
    }

    allocatedByPayment.set(
      allocation.paymentId,
      nextAllocated,
    )
    seenAllocations.add(allocation.id)
    paid += allocation.amountCents
  }

  if (paid > total) {
    throw new Error('Paiement supérieur au total de vente.')
  }

  const lines = [
    'RESTAURANT',
    'TICKET CLIENT - DOCUMENT COMMERCIAL',
    '--------------------------------',
    `Commande : ${order.id.toUpperCase()}`,
    `Date : ${date.toLocaleString('fr-BE', {
      dateStyle: 'short',
      timeStyle: 'short',
    })}`,
    `Mode : ${
      sale.consumptionMode === 'sur_place'
        ? 'SUR PLACE'
        : sale.consumptionMode === 'emporter'
          ? 'A EMPORTER'
          : 'NON PRECISE'
    }`,
    '--------------------------------',
  ]

  for (const line of sale.lines) {
    lines.push(
      `${line.quantity} x ${line.label}`,
      `  ${euros(line.unitTtcCents!)} x ${line.quantity}` +
        ` = ${euros(line.lineTtcCents!)}`,
    )
  }

  lines.push(
    '--------------------------------',
    `TOTAL TTC : ${euros(total)}`,
    'DETAIL TVA',
  )

  for (const row of sale.taxBreakdown) {
    lines.push(
      `TVA ${(row.rateBasisPoints / 100).toLocaleString('fr-BE')} %`,
      `  HT : ${euros(row.totalHtCents)}`,
      `  TVA : ${euros(row.taxCents)}`,
      `  TTC : ${euros(row.totalTtcCents)}`,
    )
  }

  lines.push(
    '--------------------------------',
    `ENCAISSE : ${euros(paid)}`,
    `RESTE DU : ${euros(total - paid)}`,
  )

  if (allocations.length) {
    lines.push('PAIEMENTS ATTRIBUES')

    for (const allocation of allocations) {
      const payment = paymentById.get(allocation.paymentId)!
      lines.push(
        `${payment.method === 'cash' ? 'Especes' : 'Carte'} : ` +
          euros(allocation.amountCents),
      )
    }
  }

  lines.push(
    '--------------------------------',
    'Document commercial - statut fiscal',
    'non certifie.',
  )

  return lines.join('\n')
}
