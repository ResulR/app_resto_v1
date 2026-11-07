import type { CartItem } from './cart'

export type LineAmount = {
  knownCents: number
  hasKnownPrice: boolean
  complete: boolean
}

export type CartAmounts = LineAmount & {
  hasItems: boolean
}

export function calculateLineAmount(
  item: CartItem,
): LineAmount {
  const prices = [
    item.priceCents,
    ...item.options.map(option => option.priceCents),
  ]

  const knownPrices = prices.filter(
    (price): price is number =>
      price !== undefined &&
      Number.isSafeInteger(price) &&
      price >= 0,
  )

  const hasKnownPrice = knownPrices.length > 0
  const complete = knownPrices.length === prices.length

  const unitCents = knownPrices.reduce(
    (sum, price) => sum + price,
    0,
  )

  const knownCents = unitCents * item.quantity

  if (!Number.isSafeInteger(knownCents)) {
    throw new Error('Montant trop élevé.')
  }

  return {
    knownCents,
    hasKnownPrice,
    complete,
  }
}

export function calculateCartAmounts(
  items: CartItem[],
): CartAmounts {
  let knownCents = 0
  let hasKnownPrice = false
  let complete = true

  for (const item of items) {
    const line = calculateLineAmount(item)

    knownCents += line.knownCents
    hasKnownPrice ||= line.hasKnownPrice
    complete &&= line.complete

    if (!Number.isSafeInteger(knownCents)) {
      throw new Error('Montant total trop élevé.')
    }
  }

  return {
    knownCents,
    hasKnownPrice,
    complete,
    hasItems: items.length > 0,
  }
}
