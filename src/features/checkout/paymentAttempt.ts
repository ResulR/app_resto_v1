import type {
  MultiOrderPaymentInput,
} from './multiOrderPayment'

export type PendingPaymentAttempt = MultiOrderPaymentInput

type AttemptStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

const KEY = 'restaurant-pwa:pending-cash-payment:v1'

function validAttempt(value: unknown): value is PendingPaymentAttempt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const row = value as Record<string, unknown>

  return (
    typeof row.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id) &&
    Array.isArray(row.orderIds) &&
    row.orderIds.length > 0 &&
    row.orderIds.length <= 100 &&
    row.orderIds.every(id =>
      typeof id === 'string' && id.length > 0
    ) &&
    new Set(row.orderIds).size === row.orderIds.length &&
    (row.method === 'cash' || row.method === 'card') &&
    typeof row.tenderedCents === 'number' &&
    Number.isSafeInteger(row.tenderedCents) &&
    row.tenderedCents > 0 &&
    row.tenderedCents <= 100000000 &&
    (row.method !== 'card' || row.cardConfirmed === true)
  )
}

export function loadPendingPayment(
  storage: AttemptStorage,
): PendingPaymentAttempt | null {
  const raw = storage.getItem(KEY)
  if (raw === null) return null

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Tentative de paiement locale illisible.')
  }

  if (!validAttempt(value)) {
    throw new Error('Tentative de paiement locale invalide.')
  }

  return structuredClone(value)
}

export function beginPaymentAttempt(
  storage: AttemptStorage,
  input: PendingPaymentAttempt,
): PendingPaymentAttempt {
  if (!validAttempt(input)) {
    throw new Error('Tentative de paiement invalide.')
  }

  if (loadPendingPayment(storage)) {
    throw new Error(
      'Un paiement précédent doit être réconcilié avant de continuer.',
    )
  }

  // Persistance AVANT toute écriture financière.
  storage.setItem(KEY, JSON.stringify(input))

  const stored = loadPendingPayment(storage)

  if (!stored || JSON.stringify(stored) !== JSON.stringify(input)) {
    throw new Error('Mémorisation du paiement impossible.')
  }

  return stored
}

export function finishPaymentAttempt(
  storage: AttemptStorage,
  id: string,
): void {
  const pending = loadPendingPayment(storage)

  if (!pending || pending.id !== id) {
    throw new Error('Confirmation de paiement locale incohérente.')
  }

  storage.removeItem(KEY)

  if (storage.getItem(KEY) !== null) {
    throw new Error('Paiement toujours en attente de réconciliation.')
  }
}
