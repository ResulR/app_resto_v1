import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { db } from '../src/shared/database/db'
import {
  calculateSaleLines,
  parseManualPrice,
  saveDraftSaleValuation,
  getSaleValuation,
} from '../src/features/checkout/saleValuation'
import type { CartItem } from '../src/features/orders/cart'
import type {
  ConfirmedOrder,
} from '../src/features/orders/orderRepository'

function item(
  id: string,
  priceCents?: number,
  quantity = 1,
): CartItem {
  return {
    id,
    productId: id,
    name: id,
    priceCents,
    options: [],
    note: '',
    quantity,
  }
}

test('C2 : prix décimaux et zéro explicite', () => {
  assert.equal(parseManualPrice('4,50'), 450)
  assert.equal(parseManualPrice('12.3'), 1230)
  assert.equal(parseManualPrice('0'), 0)
  assert.equal(parseManualPrice('0,00'), 0)

  for (const invalid of [
    '', '-1', '1.234', 'abc', '1e3',
  ]) {
    assert.throws(() => parseManualPrice(invalid))
  }
})

test('C2 : prix absent distinct de zéro', () => {
  const missing = calculateSaleLines([item('a')])

  assert.equal(missing.complete, false)
  assert.equal(missing.totalTtcCents, undefined)
  assert.equal(missing.lines[0].source, 'missing')

  const free = calculateSaleLines(
    [item('a')],
    [{ itemId: 'a', unitPrice: '0' }],
  )

  assert.equal(free.complete, true)
  assert.equal(free.totalTtcCents, 0)
  assert.equal(free.lines[0].source, 'manual')
})

test('C2 : quantités, options et prix libre', () => {
  const first = item('a', 500, 2)
  first.options = [{
    id: 'sauce',
    name: 'Sauce',
    groupName: 'Extras',
    priceCents: 50,
  }]

  const second = item('b', undefined, 3)

  const result = calculateSaleLines(
    [first, second],
    [{ itemId: 'b', unitPrice: '4,20' }],
  )

  assert.equal(result.complete, true)
  assert.equal(result.totalTtcCents, 2360)
  assert.equal(result.lines[0].lineTtcCents, 1100)
  assert.equal(result.lines[1].lineTtcCents, 1260)

  // La commande source ne doit pas être modifiée.
  assert.equal(second.priceCents, undefined)
})

test('C2 : saisies manuelles ambiguës refusées', () => {
  assert.throws(() => calculateSaleLines(
    [item('a')],
    [{ itemId: 'unknown', unitPrice: '5' }],
  ))

  assert.throws(() => calculateSaleLines(
    [item('a')],
    [
      { itemId: 'a', unitPrice: '5' },
      { itemId: 'a', unitPrice: '6' },
    ],
  ))

  assert.throws(() => calculateSaleLines([
    item('same'), item('same'),
  ]))
})

test('C2 : valorisation persistée sans mutation commande', async () => {
  await db.open()

  const original: ConfirmedOrder = {
    id: 'order-c2',
    createdAt: '2026-11-16T10:00:00.000Z',
    status: 'validated',
    items: [item('unknown', undefined, 2)],
    comment: '',
    consumptionMode: 'emporter',
    knownTotalCents: 0,
    totalComplete: false,
  }

  await db.table('orders').add(original)

  const first = await saveDraftSaleValuation('order-c2')

  assert.equal(first.status, 'draft')
  assert.equal(first.totalTtcCents, undefined)

  const second = await saveDraftSaleValuation(
    'order-c2',
    [{ itemId: 'unknown', unitPrice: '7,50' }],
  )

  assert.equal(second.id, first.id)
  assert.equal(second.totalTtcCents, 1500)
  assert.equal(second.lines[0].source, 'manual')
  assert.equal(
    (await getSaleValuation('order-c2'))?.totalTtcCents,
    1500,
  )

  const unchanged = await db.table<
    ConfirmedOrder,
    string
  >('orders').get('order-c2')

  assert.deepEqual(unchanged, original)
  assert.equal(await db.salesValuations.count(), 1)

  await db.salesValuations.update(second.id, {
    status: 'locked',
  })

  await assert.rejects(
    saveDraftSaleValuation('order-c2'),
    /verrouillée/,
  )

  db.close()
  await db.delete()
})
