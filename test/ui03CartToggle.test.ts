import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
const { createElement } = React

// Le lanceur Node/tsx utilise le runtime JSX classique.
Object.assign(globalThis, { React })
import { renderToStaticMarkup } from 'react-dom/server'

import { CartToggle } from '../src/features/orders/CartToggle'
import type { CartItem } from '../src/features/orders/cart'

function item(
  id: string,
  priceCents?: number,
): CartItem {
  return {
    id,
    productId: id,
    name: `Produit ${id}`,
    priceCents,
    options: [],
    note: '',
    quantity: 1,
  }
}

function render(items: CartItem[], open = false) {
  return renderToStaticMarkup(
    createElement(CartToggle, {
      items,
      open,
      onToggle: () => {},
    }),
  )
}

test('UI-03 : panier vide', () => {
  const html = render([])

  assert.match(html, /Panier vide/)
  assert.match(html, /0 article/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /aria-controls="order-summary"/)
})

test('UI-03 : montant complet', () => {
  const html = render([item('a', 250)], true)

  assert.match(html, /Total/)
  assert.match(html, /2,50/)
  assert.match(html, /aria-expanded="true"/)
})

test('UI-03 : montant incomplet', () => {
  const html = render([
    item('a', 250),
    item('b'),
  ])

  assert.match(html, /2 articles/)
  assert.match(html, /Montant connu/)
  assert.match(html, /2,50/)
})

test('UI-03 : aucun prix renseigné', () => {
  const html = render([item('a')])

  assert.match(html, /Montant connu/)
  assert.match(html, /Prix non renseigné/)
})
