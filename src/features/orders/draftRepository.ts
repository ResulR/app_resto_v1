import { db } from '../../shared/database/db'
import type { CartItem } from './cart'
import type { ConsumptionMode } from './orderRepository'

export type OrderDraft = {
  id: string
  updatedAt: string
  items: CartItem[]
  comment: string
  consumptionMode: ConsumptionMode
}

export type DraftInput = {
  id: string
  items: CartItem[]
  comment: string
  consumptionMode: ConsumptionMode
}

function isOrderDraft(value: unknown): value is OrderDraft {
  if (!value || typeof value !== 'object') return false

  const draft = value as Partial<OrderDraft>

  return (
    typeof draft.id === 'string' &&
    typeof draft.updatedAt === 'string' &&
    Array.isArray(draft.items) &&
    typeof draft.comment === 'string' &&
    (
      draft.consumptionMode === null ||
      draft.consumptionMode === 'sur_place' ||
      draft.consumptionMode === 'emporter'
    )
  )
}

export async function saveDraft(
  input: DraftInput,
): Promise<OrderDraft> {
  if (!input.id) {
    throw new Error('Identifiant de brouillon manquant.')
  }

  if (!input.items.length && !input.comment.trim()) {
    throw new Error('Impossible de mettre une commande vide en attente.')
  }

  if (input.comment.length > 2000) {
    throw new Error('Commentaire trop long.')
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

  const draft: OrderDraft = {
    id: input.id,
    updatedAt: new Date().toISOString(),
    items: structuredClone(input.items),
    comment: input.comment,
    consumptionMode: input.consumptionMode,
  }

  await db.drafts.put({
    id: draft.id,
    updatedAt: draft.updatedAt,
    payload: structuredClone(draft),
  })

  return structuredClone(draft)
}

export async function listDrafts(): Promise<OrderDraft[]> {
  const rows = await db.drafts
    .orderBy('updatedAt')
    .reverse()
    .toArray()

  return rows.map(row => {
    if (!isOrderDraft(row.payload)) {
      throw new Error('Brouillon incompatible avec la version actuelle.')
    }

    return structuredClone(row.payload)
  })
}

export async function getDraft(
  id: string,
): Promise<OrderDraft | undefined> {
  const row = await db.drafts.get(id)

  if (!row) return undefined

  if (!isOrderDraft(row.payload)) {
    throw new Error('Brouillon incompatible avec la version actuelle.')
  }

  return structuredClone(row.payload)
}

export async function deleteDraft(id: string): Promise<void> {
  await db.drafts.delete(id)
}
