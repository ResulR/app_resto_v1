import { db } from '../../shared/database/db'
import type {
  Payment,
  PaymentAllocation,
  SaleValuation,
} from '../../shared/database/models'
import type { ConfirmedOrder } from '../orders/orderRepository'

const MAX_CENTS = 100000000

export type PaymentInput = {
  id: string
  orderId: string
  method: 'cash' | 'card'
  // Montant remis en espèces ou validé sur le terminal.
  tenderedCents: number
  // Confirmation humaine, pas de connexion au terminal.
  cardConfirmed?: boolean
}

export type PaymentReceipt = {
  payment: Payment
  allocation: PaymentAllocation
  remainingCents: number
}

function validAmount(value: number): boolean {
  return Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_CENTS
}

function validatedSale(
  sales: SaleValuation[],
): SaleValuation {
  if (sales.length !== 1) {
    throw new Error('Valorisation unique requise.')
  }

  const sale = sales[0]

  if (
    !Number.isSafeInteger(sale.totalTtcCents) ||
    sale.totalTtcCents! < 0 ||
    sale.totalTtcCents! > MAX_CENTS ||
    !sale.consumptionMode ||
    !sale.lines.length ||
    !sale.taxBreakdown?.length
  ) {
    throw new Error('Valorisation et TVA incomplètes.')
  }

  const taxTotal = sale.taxBreakdown.reduce(
    (sum, group) => sum + group.totalTtcCents,
    0,
  )

  const linesTotal = sale.lines.reduce(
    (sum, line) => sum + (line.lineTtcCents ?? NaN),
    0,
  )

  if (
    taxTotal !== sale.totalTtcCents ||
    linesTotal !== sale.totalTtcCents ||
    sale.lines.some(line =>
      !Number.isSafeInteger(line.taxRateBasisPoints) ||
      !Number.isSafeInteger(line.taxCents) ||
      !Number.isSafeInteger(line.netCents) ||
      line.netCents! + line.taxCents! !==
        line.lineTtcCents
    )
  ) {
    throw new Error('Ventilation fiscale incohérente.')
  }

  return sale
}

export async function getOrderRemainingCents(
  orderId: string,
): Promise<number> {
  return db.transaction(
    'r',
    db.salesValuations,
    db.paymentAllocations,
    async () => {
      const sale = validatedSale(
        await db.salesValuations
          .where('orderId')
          .equals(orderId)
          .toArray(),
      )

      const allocations = await db.paymentAllocations
        .where('orderId')
        .equals(orderId)
        .toArray()

      const paid = allocations.reduce(
        (sum, allocation) => {
          if (!validAmount(allocation.amountCents)) {
            throw new Error('Allocation invalide.')
          }
          return sum + allocation.amountCents
        },
        0,
      )

      if (
        !Number.isSafeInteger(paid) ||
        paid > sale.totalTtcCents!
      ) {
        throw new Error('Montant déjà encaissé incohérent.')
      }

      return sale.totalTtcCents! - paid
    },
  )
}

export async function recordOrderPayment(
  input: PaymentInput,
): Promise<PaymentReceipt> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(input.id) ||
    !input.orderId.trim() ||
    !validAmount(input.tenderedCents) ||
    (input.method !== 'cash' && input.method !== 'card')
  ) {
    throw new Error('Données de paiement invalides.')
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
      // Idempotence : une requête réessayée avec le même ID
      // ne crée pas un deuxième paiement.
      const previous = await db.payments.get(input.id)

      if (previous) {
        const allocations = await db.paymentAllocations
          .where('paymentId')
          .equals(input.id)
          .toArray()

        if (
          allocations.length !== 1 ||
          allocations[0].orderId !== input.orderId ||
          previous.method !== input.method ||
          (input.method === 'cash'
            ? previous.receivedCents !== input.tenderedCents
            : previous.amountCents !== input.tenderedCents ||
              previous.cardConfirmed !== true)
        ) {
          throw new Error(
            'Identifiant de paiement déjà utilisé différemment.',
          )
        }

        const sale = validatedSale(
          await db.salesValuations
            .where('orderId')
            .equals(input.orderId)
            .toArray(),
        )

        const allAllocations = await db.paymentAllocations
          .where('orderId')
          .equals(input.orderId)
          .toArray()

        const paid = allAllocations.reduce(
          (sum, allocation) => sum + allocation.amountCents,
          0,
        )

        return {
          payment: structuredClone(previous),
          allocation: structuredClone(allocations[0]),
          remainingCents: sale.totalTtcCents! - paid,
        }
      }

      const order = await db.table<
        ConfirmedOrder,
        string
      >('orders').get(input.orderId)

      if (!order) {
        throw new Error('Commande introuvable.')
      }

      const sale = validatedSale(
        await db.salesValuations
          .where('orderId')
          .equals(input.orderId)
          .toArray(),
      )

      const allocations = await db.paymentAllocations
        .where('orderId')
        .equals(input.orderId)
        .toArray()

      const alreadyPaid = allocations.reduce(
        (sum, allocation) => {
          if (!validAmount(allocation.amountCents)) {
            throw new Error('Allocation invalide.')
          }
          return sum + allocation.amountCents
        },
        0,
      )

      const due = sale.totalTtcCents! - alreadyPaid

      if (!Number.isSafeInteger(due) || due <= 0) {
        throw new Error('Commande déjà réglée ou solde invalide.')
      }

      if (
        input.method === 'card' &&
        input.tenderedCents > due
      ) {
        throw new Error(
          'Paiement carte supérieur au montant restant.',
        )
      }

      const creditedCents = Math.min(
        input.tenderedCents,
        due,
      )

      const changeCents = input.method === 'cash'
        ? input.tenderedCents - creditedCents
        : 0

      const payment: Payment = {
        id: input.id,
        createdAt: new Date().toISOString(),
        method: input.method,
        amountCents: creditedCents,
        ...(input.method === 'cash'
          ? {
              receivedCents: input.tenderedCents,
              changeCents,
            }
          : { cardConfirmed: true }),
      }

      const allocation: PaymentAllocation = {
        id: crypto.randomUUID(),
        paymentId: input.id,
        orderId: input.orderId,
        amountCents: creditedCents,
      }

      await db.payments.add(payment)
      await db.paymentAllocations.add(allocation)

      if (sale.status === 'draft') {
        await db.salesValuations.update(
          sale.id,
          { status: 'locked' },
        )
      }

      return {
        payment: structuredClone(payment),
        allocation: structuredClone(allocation),
        remainingCents: due - creditedCents,
      }
    },
  )
}
