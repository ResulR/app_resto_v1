import type { Product } from '../../shared/database/models'
import type { SelectedOption } from './ProductCustomizer'

export type CartItem = {
  id: string
  productId: string
  name: string
  priceCents?: number
  options: SelectedOption[]
  note: string
  quantity: number
}

function sameItem(a: CartItem, b: CartItem): boolean {
  const optionKey = (item: CartItem) =>
    JSON.stringify(
      item.options
        .map(option => [
          option.id,
          option.name,
          option.groupName,
          option.priceCents ?? null,
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    )

  return (
    a.productId === b.productId &&
    a.name === b.name &&
    a.priceCents === b.priceCents &&
    a.note === b.note &&
    optionKey(a) === optionKey(b)
  )
}

function merge(
  items: CartItem[],
  incoming: CartItem,
): CartItem[] {
  const index = items.findIndex(item => sameItem(item, incoming))

  if (index === -1) {
    return [...items, incoming]
  }

  return items.map((item, position) =>
    position === index
      ? { ...item, quantity: item.quantity + incoming.quantity }
      : item,
  )
}

export function addToCart(
  items: CartItem[],
  product: Product,
  options: SelectedOption[] = [],
  note = '',
): CartItem[] {
  return merge(items, {
    id: crypto.randomUUID(),
    productId: product.id,
    name: product.name,
    priceCents: product.priceCents,
    options: [...options],
    note: note.trim(),
    quantity: 1,
  })
}

export function changeCartQuantity(
  items: CartItem[],
  id: string,
  delta: 1 | -1,
): CartItem[] {
  return items.flatMap(item => {
    if (item.id !== id) return [item]

    const quantity = item.quantity + delta

    return quantity > 0
      ? [{ ...item, quantity }]
      : []
  })
}

export function editCartUnit(
  items: CartItem[],
  id: string,
  product: Product,
  options: SelectedOption[],
  note: string,
): CartItem[] {
  const original = items.find(item => item.id === id)

  if (!original) return items

  // Une seule unité est extraite du lot.
  const remaining = items.flatMap(item => {
    if (item.id !== id) return [item]

    if (item.quantity === 1) return []

    return [{ ...item, quantity: item.quantity - 1 }]
  })

  return addToCart(remaining, product, options, note)
}
