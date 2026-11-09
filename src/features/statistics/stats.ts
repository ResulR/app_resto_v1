import type { ConfirmedOrder } from '../orders/orderRepository'

export type StatsPeriod = 'today' | '7days' | '30days' | 'all'

export interface PopularProduct {
  key: string
  name: string
  quantity: number
}

export interface RestaurantStats {
  orderCount: number
  activeCount: number
  completedCount: number
  itemCount: number
  knownTotalCents: number
  incompleteOrderCount: number
  popularProducts: PopularProduct[]
}

function startOfPeriod(
  period: StatsPeriod,
  now: Date,
): number {
  if (period === 'all') {
    return Number.NEGATIVE_INFINITY
  }

  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  if (period === '7days') {
    start.setDate(start.getDate() - 6)
  }

  if (period === '30days') {
    start.setDate(start.getDate() - 29)
  }

  return start.getTime()
}

/**
 * Statistiques basées uniquement sur les commandes
 * effectivement validées dans IndexedDB.
 *
 * Les brouillons ne sont pas comptés.
 * Les montants représentent des ventes théoriques,
 * jamais des paiements encaissés.
 */
export function calculateRestaurantStats(
  orders: readonly ConfirmedOrder[],
  period: StatsPeriod,
  now = new Date(),
): RestaurantStats {
  const start = startOfPeriod(period, now)
  const end = now.getTime()

  const products = new Map<string, PopularProduct>()

  let orderCount = 0
  let activeCount = 0
  let completedCount = 0
  let itemCount = 0
  let knownTotalCents = 0
  let incompleteOrderCount = 0

  for (const order of orders) {
    const createdAt = Date.parse(order.createdAt)

    if (
      !Number.isFinite(createdAt) ||
      createdAt < start ||
      createdAt > end
    ) {
      continue
    }

    if (
      order.status !== 'validated' &&
      order.status !== 'completed'
    ) {
      continue
    }

    orderCount += 1

    if (order.status === 'validated') {
      activeCount += 1
    } else {
      completedCount += 1
    }

    knownTotalCents += order.knownTotalCents

    if (!order.totalComplete) {
      incompleteOrderCount += 1
    }

    for (const item of order.items) {
      if (
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        continue
      }

      itemCount += item.quantity

      // Les produits libres utilisent un identifiant
      // unique par ligne. Les regrouper par nom permet
      // un classement utile sans créer de faux produits.
      const free = item.productId.startsWith('free:')

      const key = free
        ? `free:${item.name.trim().toLocaleLowerCase('fr-BE')}`
        : `product:${item.productId}`

      const existing = products.get(key)

      if (existing) {
        existing.quantity += item.quantity
      } else {
        products.set(key, {
          key,
          name: item.name,
          quantity: item.quantity,
        })
      }
    }
  }

  const popularProducts = [...products.values()]
    .sort(
      (a, b) =>
        b.quantity - a.quantity ||
        a.name.localeCompare(b.name, 'fr-BE'),
    )
    .slice(0, 10)

  return {
    orderCount,
    activeCount,
    completedCount,
    itemCount,
    knownTotalCents,
    incompleteOrderCount,
    popularProducts,
  }
}
