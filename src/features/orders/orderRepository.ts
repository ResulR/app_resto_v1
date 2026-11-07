import { db } from '../../shared/database/db'
import type { CartItem } from './cart'
import { calculateCartAmounts } from './pricing'

export type ConsumptionMode = 'sur_place' | 'emporter' | null

export type ConfirmedOrder = {
  id: string
  createdAt: string
  status: 'validated'
  items: CartItem[]
  comment: string
  consumptionMode: ConsumptionMode
  knownTotalCents: number
  totalComplete: boolean
}

export type ConfirmOrderInput = {
  id: string
  items: CartItem[]
  comment: string
  consumptionMode: ConsumptionMode
}

const orders = () => db.table<ConfirmedOrder, string>('orders')

export async function confirmOrder(
  input: ConfirmOrderInput,
): Promise<ConfirmedOrder> {
  if (!input.id) {
    throw new Error('Identifiant de commande manquant.')
  }

  if (!input.items.length) {
    throw new Error('Impossible de valider une commande vide.')
  }

  if (
    input.items.some(
      item =>
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1,
    )
  ) {
    throw new Error('Quantité invalide.')
  }

  if (input.comment.length > 2000) {
    throw new Error('Commentaire trop long.')
  }

  if (
    input.consumptionMode !== null &&
    input.consumptionMode !== 'sur_place' &&
    input.consumptionMode !== 'emporter'
  ) {
    throw new Error('Mode de consommation invalide.')
  }

  // Instantané indépendant des modifications futures du catalogue.
  const items = structuredClone(input.items)
  const amounts = calculateCartAmounts(items)

  const order: ConfirmedOrder = {
    id: input.id,
    createdAt: new Date().toISOString(),
    status: 'validated',
    items,
    comment: input.comment.trim(),
    consumptionMode: input.consumptionMode,
    knownTotalCents: amounts.knownCents,
    totalComplete: amounts.complete,
  }

  // add() refuse les identifiants déjà utilisés.
  // Une transaction IndexedDB valide l'enregistrement atomiquement.
  await db.transaction('rw', orders(), async () => {
    await orders().add(order)
  })

  return structuredClone(order)
}

export async function getConfirmedOrder(
  id: string,
): Promise<ConfirmedOrder | undefined> {
  const order = await orders().get(id)
  return order ? structuredClone(order) : undefined
}

export async function listActiveOrders(): Promise<ConfirmedOrder[]> {
  const rows = await orders()
    .orderBy('createdAt')
    .reverse()
    .toArray()

  return rows
    .filter(order => order.status === 'validated')
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    )
    .map(order => structuredClone(order))
}

export async function getLatestConfirmedOrder():
  Promise<ConfirmedOrder | undefined> {
  const order = await orders()
    .orderBy('createdAt')
    .last()

  return order ? structuredClone(order) : undefined
}
