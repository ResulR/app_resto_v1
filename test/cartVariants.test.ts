import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addToCart, editCartUnit } from '../src/features/orders/cart'
import { calculateCartAmounts } from '../src/features/orders/pricing'
import type { Product } from '../src/shared/database/models'

const product: Product = {
  id: 'panini',
  categoryId: 'paninis',
  name: 'Panini poulet',
  priceCents: 500,
  position: 0,
  active: true,
}

const petite = {
  id: 'petite',
  name: 'Petite',
  priceCents: 400,
}

const grande = {
  id: 'grande',
  name: 'Grande',
  priceCents: 650,
}

function addVariant(
  items: ReturnType<typeof addToCart>,
  variant: typeof petite,
) {
  return addToCart(
    items,
    { ...product, priceCents: variant.priceCents },
    [],
    '',
    variant,
  )
}

test('la variante est facultative', () => {
  const items = addToCart([], product)

  assert.equal(items.length, 1)
  assert.equal(items[0].variant, undefined)
  assert.equal(items[0].priceCents, 500)
})

test('variante conservée et prix correctement calculé', () => {
  const items = addVariant([], grande)

  assert.equal(items[0].name, 'Panini poulet — Grande')
  assert.equal(items[0].variant?.id, 'grande')
  assert.equal(items[0].priceCents, 650)
  assert.equal(calculateCartAmounts(items).knownCents, 650)
})

test('tailles différentes : deux lignes', () => {
  const items = addVariant(addVariant([], petite), grande)

  assert.equal(items.length, 2)
  assert.equal(calculateCartAmounts(items).knownCents, 1050)
})

test('taille identique : regroupement', () => {
  const items = addVariant(addVariant([], grande), grande)

  assert.equal(items.length, 1)
  assert.equal(items[0].quantity, 2)
  assert.equal(calculateCartAmounts(items).knownCents, 1300)
})

test('modifier une unité sur deux sans modifier l’autre', () => {
  const items = addVariant(addVariant([], grande), grande)

  const updated = editCartUnit(
    items,
    items[0].id,
    { ...product, priceCents: petite.priceCents },
    [],
    '',
    petite,
  )

  assert.equal(updated.length, 2)
  assert.deepEqual(
    updated.map(item => item.quantity).sort(),
    [1, 1],
  )
  assert.equal(calculateCartAmounts(updated).knownCents, 1050)
  assert.deepEqual(
    updated.map(item => item.name).sort(),
    ['Panini poulet — Grande', 'Panini poulet — Petite'],
  )
})

test('prix zéro et prix absent sont distincts', () => {
  const gratuit = addToCart(
    [],
    { ...product, priceCents: 0 },
  )
  const inconnu = addToCart(
    [],
    { ...product, priceCents: undefined },
  )

  assert.equal(calculateCartAmounts(gratuit).complete, true)
  assert.equal(calculateCartAmounts(inconnu).complete, false)
})

test('snapshot de variante indépendant des changements', () => {
  const chosen = { ...grande }
  const items = addVariant([], chosen)
  const saved = structuredClone(items)

  chosen.name = 'Très grande'
  chosen.priceCents = 999

  assert.equal(saved[0].name, 'Panini poulet — Grande')
  assert.equal(saved[0].variant?.name, 'Grande')
  assert.equal(saved[0].priceCents, 650)
})
