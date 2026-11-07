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

export type FreeItemInput = {
  name: string
  quantity: number
  price: string
  note: string
}

export function addFreeItem(
  items: CartItem[],
  input: FreeItemInput,
): CartItem[] {
  const name = input.name.trim().replace(/\s+/g, ' ')

  if (!name || name.length > 120) {
    throw new Error('Nom requis : 1 à 120 caractères.')
  }

  if (
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 999
  ) {
    throw new Error('Quantité invalide : 1 à 999.')
  }

  if (input.note.length > 1000) {
    throw new Error('Note trop longue.')
  }

  const raw = input.price.trim()
  let priceCents: number | undefined

  if (raw !== '') {
    const normalized = raw.replace(',', '.')

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      throw new Error('Prix invalide. Exemple : 4,50')
    }

    const [euros, cents = ''] = normalized.split('.')

    const calculated =
      Number(euros) * 100 + Number(cents.padEnd(2, '0'))

    if (
      !Number.isSafeInteger(calculated) ||
      calculated > 100000000
    ) {
      throw new Error('Prix trop élevé.')
    }

    priceCents = calculated
  }

  const id = crypto.randomUUID()

  // Identifiant unique : aucune création dans le catalogue.
  // Chaque saisie libre reste une ligne indépendante.
  return [
    ...items,
    {
      id,
      productId: `free:${id}`,
      name,
      priceCents,
      options: [],
      note: input.note.trim(),
      quantity: input.quantity,
    },
  ]
}
