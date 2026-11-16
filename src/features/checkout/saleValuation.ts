import { db } from '../../shared/database/db'
import type {
  SaleValuation,
  SaleValuationLine,
} from '../../shared/database/models'
import type { CartItem } from '../orders/cart'
import {
  calculateLineAmount,
} from '../orders/pricing'
import type {
  ConfirmedOrder,
} from '../orders/orderRepository'

export interface ManualLinePrice {
  itemId: string
  unitPrice: string
}

const MAX_CENTS = 100000000

export function parseManualPrice(value: string): number {
  const raw = value.trim().replace(',', '.')

  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error('Prix invalide. Exemple : 4,50')
  }

  const [euros, decimals = ''] = raw.split('.')
  const cents =
    Number(euros) * 100 +
    Number(decimals.padEnd(2, '0'))

  if (
    !Number.isSafeInteger(cents) ||
    cents > MAX_CENTS
  ) {
    throw new Error('Prix trop élevé.')
  }

  return cents
}

export function calculateSaleLines(
  items: readonly CartItem[],
  overrides: readonly ManualLinePrice[] = [],
): {
  lines: SaleValuationLine[]
  totalTtcCents?: number
  complete: boolean
} {
  const prices = new Map<string, number>()
  const itemIds = new Set(items.map(item => item.id))

  if (itemIds.size !== items.length) {
    throw new Error('Identifiants des lignes dupliqués.')
  }

  for (const override of overrides) {
    if (
      !itemIds.has(override.itemId) ||
      prices.has(override.itemId)
    ) {
      throw new Error('Prix manuel non associé à une ligne unique.')
    }

    prices.set(
      override.itemId,
      parseManualPrice(override.unitPrice),
    )
  }

  let total = 0
  let complete = true

  const lines = items.map(item => {
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1
    ) {
      throw new Error('Quantité invalide.')
    }

    const manual = prices.get(item.id)
    const calculated = calculateLineAmount(item)

    const unitTtcCents = manual !== undefined
      ? manual
      : calculated.complete
        ? calculated.knownCents / item.quantity
        : undefined

    if (
      unitTtcCents === undefined ||
      !Number.isSafeInteger(unitTtcCents)
    ) {
      complete = false

      return {
        itemId: item.id,
        productId: item.productId,
        label: item.name,
        quantity: item.quantity,
        source: 'missing' as const,
      }
    }

    const lineTtcCents = unitTtcCents * item.quantity

    if (
      !Number.isSafeInteger(lineTtcCents) ||
      lineTtcCents > MAX_CENTS
    ) {
      throw new Error('Montant de ligne trop élevé.')
    }

    total += lineTtcCents

    if (
      !Number.isSafeInteger(total) ||
      total > MAX_CENTS
    ) {
      throw new Error('Total de vente trop élevé.')
    }

    return {
      itemId: item.id,
      productId: item.productId,
      label: item.name,
      quantity: item.quantity,
      unitTtcCents,
      lineTtcCents,
      source: manual !== undefined
        ? 'manual' as const
        : 'catalog' as const,
    }
  })

  if (!items.length) {
    throw new Error('Vente sans articles.')
  }

  return {
    lines,
    complete,
    ...(complete ? { totalTtcCents: total } : {}),
  }
}

export async function saveDraftSaleValuation(
  orderId: string,
  overrides: readonly ManualLinePrice[] = [],
): Promise<SaleValuation> {
  return db.transaction(
    'rw',
    db.table('orders'),
    db.salesValuations,
    db.paymentAllocations,
    async () => {
      const order = await db.table<
        ConfirmedOrder,
        string
      >('orders').get(orderId)

      if (!order) {
        throw new Error('Commande introuvable.')
      }

      const allocated = await db.paymentAllocations
        .where('orderId')
        .equals(orderId)
        .first()

      if (allocated) {
        throw new Error(
          'Impossible de modifier une vente déjà encaissée.',
        )
      }

      const existing = await db.salesValuations
        .where('orderId')
        .equals(orderId)
        .toArray()

      if (existing.length > 1) {
        throw new Error(
          'Plusieurs valorisations pour cette commande.',
        )
      }

      if (existing[0]?.status === 'locked') {
        throw new Error('Valorisation déjà verrouillée.')
      }

      const amounts = calculateSaleLines(
        order.items,
        overrides,
      )

      const valuation: SaleValuation = {
        id: existing[0]?.id ?? crypto.randomUUID(),
        orderId,
        createdAt:
          existing[0]?.createdAt ??
          new Date().toISOString(),
        status: 'draft',
        ...(order.consumptionMode
          ? { consumptionMode: order.consumptionMode }
          : {}),
        ...amounts,
      }

      // Les montants restent hors de la commande d'origine.
      await db.salesValuations.put(valuation)

      return structuredClone(valuation)
    },
  )
}

export async function getSaleValuation(
  orderId: string,
): Promise<SaleValuation | undefined> {
  const rows = await db.salesValuations
    .where('orderId')
    .equals(orderId)
    .toArray()

  if (rows.length > 1) {
    throw new Error(
      'Plusieurs valorisations pour cette commande.',
    )
  }

  return rows[0] ? structuredClone(rows[0]) : undefined
}
