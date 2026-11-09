import type { ConfirmedOrder } from './orderRepository'

export type OrderHistorySection = 'recent' | 'archive'

export interface OrderHistoryGroups {
  recent: ConfirmedOrder[]
  archive: ConfirmedOrder[]
}

/**
 * Les 30 derniers jours calendaires, aujourd'hui inclus.
 * Le fuseau horaire du navigateur détermine le jour local.
 *
 * Cette fonction ne supprime ni ne modifie de commande.
 */
export function historyCutoff(now: Date): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - 29)
  return start.getTime()
}

export function groupCompletedOrders(
  orders: readonly ConfirmedOrder[],
  now = new Date(),
): OrderHistoryGroups {
  const recent: ConfirmedOrder[] = []
  const archive: ConfirmedOrder[] = []

  const cutoff = historyCutoff(now)

  for (const order of orders) {
    if (order.status !== 'completed') continue

    // Une date de fin absente se rabat sur la création.
    // Une date totalement invalide reste consultable
    // dans les archives, jamais supprimée.
    const value = order.completedAt ?? order.createdAt
    const timestamp = Date.parse(value)

    if (
      Number.isFinite(timestamp) &&
      timestamp >= cutoff
    ) {
      recent.push(order)
    } else {
      archive.push(order)
    }
  }

  return { recent, archive }
}
