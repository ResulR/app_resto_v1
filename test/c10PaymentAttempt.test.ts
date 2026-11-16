import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  beginPaymentAttempt,
  finishPaymentAttempt,
  loadPendingPayment,
} from '../src/features/checkout/paymentAttempt'

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function storage() {
  const map = new Map<string, string>()
  return {
    getItem(key: string) {
      return map.get(key) ?? null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
    removeItem(key: string) {
      map.delete(key)
    },
  }
}

function attempt() {
  return {
    id,
    orderIds: ['commande-1', 'commande-2'],
    method: 'cash' as const,
    tenderedCents: 1200,
  }
}

test('C10 : tentative conservée entre deux lectures', () => {
  const store = storage()
  beginPaymentAttempt(store, attempt())

  const recovered = loadPendingPayment(store)
  assert.deepEqual(recovered, attempt())
})

test('C10 : deuxième encaissement bloqué avant réconciliation', () => {
  const store = storage()
  beginPaymentAttempt(store, attempt())

  assert.throws(
    () => beginPaymentAttempt(store, {
      ...attempt(),
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }),
    /réconcilié/,
  )

  assert.deepEqual(loadPendingPayment(store), attempt())
})

test('C10 : mauvais identifiant ne libère pas la tentative', () => {
  const store = storage()
  beginPaymentAttempt(store, attempt())

  assert.throws(
    () => finishPaymentAttempt(store, 'wrong'),
    /incohérente/,
  )

  assert.deepEqual(loadPendingPayment(store), attempt())
})

test('C10 : confirmation réussie libère la tentative', () => {
  const store = storage()
  beginPaymentAttempt(store, attempt())
  finishPaymentAttempt(store, id)

  assert.equal(loadPendingPayment(store), null)

  assert.doesNotThrow(() =>
    beginPaymentAttempt(store, {
      ...attempt(),
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }),
  )
})

test('C10 : stockage indisponible interdit le paiement', () => {
  const store = {
    getItem(): string | null {
      throw new Error('Stockage indisponible')
    },
    setItem(): void {
      throw new Error('Stockage indisponible')
    },
    removeItem(): void {
      throw new Error('Stockage indisponible')
    },
  }

  assert.throws(
    () => beginPaymentAttempt(store, attempt()),
    /Stockage indisponible/,
  )
})

test('C10 : carte sans confirmation refusée', () => {
  assert.throws(
    () => beginPaymentAttempt(storage(), {
      ...attempt(),
      method: 'card',
    }),
    /invalide/,
  )
})
