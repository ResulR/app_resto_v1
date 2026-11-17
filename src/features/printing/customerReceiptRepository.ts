import { db } from '../../shared/database/db'
import type {
  Payment,
  PaymentAllocation,
  SaleValuation,
} from '../../shared/database/models'
import type {
  ConfirmedOrder,
} from '../orders/orderRepository'
import { createCustomerReceipt } from './customerReceipt'

/**
 * Assemble les données d'une seule commande.
 * Aucun paiement inconnu ni doublon de valorisation
 * n'est silencieusement ignoré.
 */
export function assembleCustomerReceipt(
  order: ConfirmedOrder | undefined,
  sales: readonly SaleValuation[],
  allocations: readonly PaymentAllocation[],
  payments: readonly (Payment | undefined)[],
): string | null {
  if (!order) {
    throw new Error('Commande introuvable.')
  }

  if (sales.length > 1) {
    throw new Error('Valorisations multiples pour la commande.')
  }

  const sale = sales[0]

  if (!sale || sale.status !== 'locked') {
    return null
  }

  if (payments.some(payment => !payment)) {
    throw new Error('Paiement référencé introuvable.')
  }

  return createCustomerReceipt(
    order,
    sale,
    allocations,
    payments.filter(
      (payment): payment is Payment => payment !== undefined,
    ),
  )
}

/**
 * Tous les enregistrements sont lus dans la même
 * transaction readonly IndexedDB.
 *
 * null signifie : pas encore de vente verrouillée.
 * Une incohérence provoque une erreur, jamais
 * un ticket financier partiellement reconstitué.
 */
export async function loadCustomerReceipt(
  orderId: string,
): Promise<string | null> {
  if (!orderId.trim()) {
    throw new Error('Identifiant de commande manquant.')
  }

  return db.transaction(
    'r',
    db.table('orders'),
    db.salesValuations,
    db.paymentAllocations,
    db.payments,
    async () => {
      const order = await db
        .table<ConfirmedOrder, string>('orders')
        .get(orderId)

      const sales = await db.salesValuations
        .where('orderId')
        .equals(orderId)
        .toArray()

      const allocations = await db.paymentAllocations
        .where('orderId')
        .equals(orderId)
        .toArray()

      const paymentIds = [
        ...new Set(allocations.map(row => row.paymentId)),
      ]

      const payments = await db.payments.bulkGet(paymentIds)

      return assembleCustomerReceipt(
        order,
        sales,
        allocations,
        payments,
      )
    },
  )
}
