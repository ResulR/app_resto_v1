import { db } from '../../shared/database/db'
import {
  listActiveOrders,
  listCompletedOrders,
} from '../orders/orderRepository'

export async function getCashRegisterData() {
    const [active, completed, sales, allocations, configs] =
      await Promise.all([
        listActiveOrders(),
        listCompletedOrders(),
        db.salesValuations.toArray(),
        db.paymentAllocations.toArray(),
        db.taxConfigurations.toArray(),
      ])

    const valuations = new Map(
      sales.map(sale => [sale.orderId, sale]),
    )
    const paid = new Map<string, number>()

    for (const allocation of allocations) {
      paid.set(
        allocation.orderId,
        (paid.get(allocation.orderId) ?? 0) +
          allocation.amountCents,
      )
    }

    const orders = [...active, ...completed].filter(order => {
      const total = valuations.get(order.id)?.totalTtcCents
      return total === undefined ||
        (paid.get(order.id) ?? 0) < total
    })

    return { orders, valuations, paid, configs }
}
