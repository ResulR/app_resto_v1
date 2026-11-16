import { db } from '../../shared/database/db'
import type {
  Payment,
  PaymentAllocation,
  SaleValuation,
} from '../../shared/database/models'
import type {
  ConfirmedOrder,
} from '../orders/orderRepository'

const MAX_CENTS = 100000000

export interface MultiOrderPaymentInput {
  id: string
  orderIds: string[]
  method: 'cash' | 'card'
  tenderedCents: number
  cardConfirmed?: boolean
}

export interface MultiOrderPaymentResult {
  payment: Payment
  allocations: PaymentAllocation[]
  remainingByOrder: Record<string, number>
}

function validMoney(value: number): boolean {
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_CENTS
}

function validateSale(sales: SaleValuation[]): SaleValuation {
  if (sales.length !== 1) {
    throw new Error('Une valorisation unique est requise.')
  }

  const sale = sales[0]

  if (
    !validMoney(sale.totalTtcCents ?? NaN) ||
    !sale.consumptionMode ||
    !sale.lines.length ||
    !sale.taxBreakdown?.length
  ) {
    throw new Error('Valorisation fiscale incomplète.')
  }

  let linesTotal = 0
  let taxTotal = 0
  const grossByRate = new Map<number, number>()
  const netByRate = new Map<number, number>()
  const vatByRate = new Map<number, number>()

  for (const line of sale.lines) {
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      !validMoney(line.unitTtcCents ?? NaN) ||
      !validMoney(line.lineTtcCents ?? NaN) ||
      line.unitTtcCents! * line.quantity !== line.lineTtcCents ||
      !Number.isSafeInteger(line.taxRateBasisPoints) ||
      !validMoney(line.netCents ?? NaN) ||
      !validMoney(line.taxCents ?? NaN) ||
      line.netCents! + line.taxCents! !== line.lineTtcCents
    ) {
      throw new Error('Ligne fiscale incohérente.')
    }

    const rate = line.taxRateBasisPoints!
    linesTotal += line.lineTtcCents!
    grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + line.lineTtcCents!)
    netByRate.set(rate, (netByRate.get(rate) ?? 0) + line.netCents!)
    vatByRate.set(rate, (vatByRate.get(rate) ?? 0) + line.taxCents!)
  }

  if (
    !validMoney(linesTotal) ||
    linesTotal !== sale.totalTtcCents
  ) {
    throw new Error('Total des lignes incohérent.')
  }

  const seenRates = new Set<number>()
  for (const group of sale.taxBreakdown) {
    if (
      seenRates.has(group.rateBasisPoints) ||
      group.totalTtcCents !== grossByRate.get(group.rateBasisPoints) ||
      group.totalHtCents !== netByRate.get(group.rateBasisPoints) ||
      group.taxCents !== vatByRate.get(group.rateBasisPoints)
    ) {
      throw new Error('Ventilation TVA incohérente.')
    }
    seenRates.add(group.rateBasisPoints)
    taxTotal += group.totalTtcCents
  }

  if (
    seenRates.size !== grossByRate.size ||
    taxTotal !== sale.totalTtcCents
  ) {
    throw new Error('Total TVA incohérent.')
  }

  return sale
}

/**
 * Répartition au prorata des soldes dus.
 * Les centimes restants vont aux plus grands restes ;
 * en cas d'égalité, l'ordre initial départage.
 * BigInt évite les erreurs de précision des produits.
 */
export function allocateProportionally(
  dues: readonly number[],
  amountCents: number,
): number[] {
  if (
    !dues.length ||
    dues.some(due => !validMoney(due)) ||
    !validMoney(amountCents)
  ) {
    throw new Error('Répartition invalide.')
  }

  const total = dues.reduce((sum, due) => sum + due, 0)

  if (
    !Number.isSafeInteger(total) ||
    total > MAX_CENTS ||
    amountCents > total
  ) {
    throw new Error('Montant à répartir invalide.')
  }

  if (total === 0) {
    if (amountCents !== 0) {
      throw new Error('Aucun solde dû.')
    }
    return dues.map(() => 0)
  }

  const denominator = BigInt(total)
  const shares = dues.map((due, index) => {
    const numerator = BigInt(due) * BigInt(amountCents)

    return {
      index,
      cents: Number(numerator / denominator),
      remainder: numerator % denominator,
    }
  })

  let undistributed = amountCents -
    shares.reduce((sum, share) => sum + share.cents, 0)

  const priority = [...shares].sort((a, b) => {
    if (a.remainder === b.remainder) {
      return a.index - b.index
    }
    return a.remainder > b.remainder ? -1 : 1
  })

  for (const share of priority) {
    if (undistributed === 0) break
    if (share.cents < dues[share.index]) {
      share.cents += 1
      undistributed -= 1
    }
  }

  if (undistributed !== 0) {
    throw new Error('Répartition incomplète.')
  }

  return shares
    .sort((a, b) => a.index - b.index)
    .map(share => share.cents)
}

export async function recordMultiOrderPayment(
  input: MultiOrderPaymentInput,
): Promise<MultiOrderPaymentResult> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(input.id) ||
    !Array.isArray(input.orderIds) ||
    input.orderIds.length === 0 ||
    input.orderIds.length > 100 ||
    input.orderIds.some(id =>
      typeof id !== 'string' || !id.trim()
    ) ||
    new Set(input.orderIds).size !== input.orderIds.length ||
    !validMoney(input.tenderedCents) ||
    input.tenderedCents === 0 ||
    !['cash', 'card'].includes(input.method)
  ) {
    throw new Error('Paiement multi-commandes invalide.')
  }

  if (
    input.method === 'card' &&
    input.cardConfirmed !== true
  ) {
    throw new Error('Confirmation carte obligatoire.')
  }

  return db.transaction(
    'rw',
    db.table('orders'),
    db.salesValuations,
    db.payments,
    db.paymentAllocations,
    async () => {
      const previous = await db.payments.get(input.id)

      if (previous) {
        const sameRequest =
          previous.method === input.method &&
          JSON.stringify(previous.requestedOrderIds) ===
            JSON.stringify(input.orderIds) &&
          (input.method === 'cash'
            ? previous.receivedCents === input.tenderedCents
            : previous.amountCents === input.tenderedCents &&
              previous.cardConfirmed === true)

        if (!sameRequest) {
          throw new Error(
            'Identifiant de paiement réutilisé différemment.',
          )
        }

        const allocations = await db.paymentAllocations
          .where('paymentId')
          .equals(input.id)
          .toArray()

        if (
          allocations.length === 0 ||
          allocations.reduce((s, a) => s + a.amountCents, 0) !==
            previous.amountCents ||
          allocations.some(a => !input.orderIds.includes(a.orderId))
        ) {
          throw new Error('Répartition enregistrée incohérente.')
        }

        return {
          payment: structuredClone(previous),
          allocations: structuredClone(allocations),
          remainingByOrder: await getRemaining(input.orderIds),
        }
      }

      const remainingByOrder = await getRemaining(input.orderIds)
      const totalDue = Object.values(remainingByOrder)
        .reduce((sum, value) => sum + value, 0)

      if (
        !validMoney(totalDue) ||
        totalDue === 0
      ) {
        throw new Error('Aucun montant restant à payer.')
      }

      if (
        input.method === 'card' &&
        input.tenderedCents > totalDue
      ) {
        throw new Error('Paiement carte supérieur au solde dû.')
      }

      const credited = Math.min(input.tenderedCents, totalDue)
      const dueAmounts = input.orderIds.map(
        orderId => remainingByOrder[orderId],
      )
      const distributed = allocateProportionally(
        dueAmounts,
        credited,
      )

      const allocations: PaymentAllocation[] = []

      for (const [index, orderId] of input.orderIds.entries()) {
        const amountCents = distributed[index]

        if (amountCents > 0) {
          allocations.push({
            id: crypto.randomUUID(),
            paymentId: input.id,
            orderId,
            amountCents,
          })
          remainingByOrder[orderId] -= amountCents
        }
      }

      if (
        allocations.length === 0 ||
        allocations.reduce(
          (sum, allocation) => sum + allocation.amountCents,
          0,
        ) !== credited
      ) {
        throw new Error('Répartition du paiement impossible.')
      }

      const payment: Payment = {
        id: input.id,
        createdAt: new Date().toISOString(),
        method: input.method,
        amountCents: credited,
        requestedOrderIds: [...input.orderIds],
        ...(input.method === 'cash'
          ? {
              receivedCents: input.tenderedCents,
              changeCents: input.tenderedCents - credited,
            }
          : { cardConfirmed: true }),
      }

      await db.payments.add(payment)
      await db.paymentAllocations.bulkAdd(allocations)

      for (const allocation of allocations) {
        const sale = await db.salesValuations
          .where('orderId')
          .equals(allocation.orderId)
          .first()

        if (sale?.status === 'draft') {
          await db.salesValuations.update(
            sale.id,
            { status: 'locked' },
          )
        }
      }

      return {
        payment: structuredClone(payment),
        allocations: structuredClone(allocations),
        remainingByOrder,
      }
    },
  )
}

// Doit être appelé dans la transaction du paiement.
async function getRemaining(
  orderIds: readonly string[],
): Promise<Record<string, number>> {
  const remaining: Record<string, number> = Object.create(null)

  for (const orderId of orderIds) {
    const order = await db.table<
      ConfirmedOrder,
      string
    >('orders').get(orderId)

    if (!order) {
      throw new Error(`Commande introuvable : ${orderId}`)
    }

    const sale = validateSale(
      await db.salesValuations
        .where('orderId')
        .equals(orderId)
        .toArray(),
    )

    const allocations = await db.paymentAllocations
      .where('orderId')
      .equals(orderId)
      .toArray()

    let paid = 0
    for (const allocation of allocations) {
      const payment = await db.payments.get(allocation.paymentId)

      if (
        !payment ||
        !validMoney(allocation.amountCents) ||
        allocation.amountCents === 0
      ) {
        throw new Error('Écriture de paiement incohérente.')
      }

      paid += allocation.amountCents
    }

    if (
      !validMoney(paid) ||
      paid > sale.totalTtcCents!
    ) {
      throw new Error('Commande surpayée.')
    }

    remaining[orderId] = sale.totalTtcCents! - paid
  }

  return remaining
}
