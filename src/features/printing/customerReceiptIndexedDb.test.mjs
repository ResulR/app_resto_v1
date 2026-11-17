import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('lecture transactionnelle et paiements groupes', async () => {
  // Import dynamique APRES installation du faux IndexedDB.
  const { db } = await import(
    '../../shared/database/db.ts'
  )
  const { loadCustomerReceipt } = await import(
    './customerReceiptRepository.ts'
  )

  const orderId =
    '11111111-1111-4111-8111-111111111111'
  const otherId =
    '22222222-2222-4222-8222-222222222222'
  const now = '2026-11-17T12:00:00.000Z'

  const order = id => ({
    id,
    createdAt: now,
    status: 'completed',
    completedAt: now,
    items: [],
    comment: '',
    consumptionMode: 'emporter',
    knownTotalCents: id === orderId ? 1100 : 300,
    totalComplete: true,
  })

  const makeSale = (id, total, net, vat) => ({
    id: `sale-${id}`,
    orderId: id,
    createdAt: now,
    status: 'locked',
    totalTtcCents: total,
    consumptionMode: 'emporter',
    lines: [{
      itemId: `item-${id}`,
      productId: 'product-1',
      label: 'Panini',
      quantity: 1,
      unitTtcCents: total,
      lineTtcCents: total,
      source: 'manual',
      taxRateBasisPoints: 1000,
      netCents: net,
      taxCents: vat,
    }],
    taxBreakdown: [{
      rateBasisPoints: 1000,
      totalTtcCents: total,
      totalHtCents: net,
      taxCents: vat,
    }],
  })

  try {
    await db.open()

    // Toutes ces données sont exclusivement en mémoire
    // dans le processus de test.
    await db.transaction(
      'rw',
      db.table('orders'),
      db.salesValuations,
      db.payments,
      db.paymentAllocations,
      async () => {
        await db.table('orders').bulkPut([
          order(orderId),
          order(otherId),
        ])

        await db.salesValuations.bulkPut([
          makeSale(orderId, 1100, 1000, 100),
          makeSale(otherId, 300, 273, 27),
        ])

        await db.payments.add({
          id: 'payment-group',
          createdAt: now,
          method: 'cash',
          amountCents: 900,
          receivedCents: 900,
          changeCents: 0,
        })

        await db.paymentAllocations.bulkAdd([
          {
            id: 'allocation-1',
            paymentId: 'payment-group',
            orderId,
            amountCents: 600,
          },
          {
            id: 'allocation-2',
            paymentId: 'payment-group',
            orderId: otherId,
            amountCents: 300,
          },
        ])
      },
    )

    const partial = await loadCustomerReceipt(orderId)

    assert.equal(typeof partial, 'string')
    assert.match(partial, /TOTAL TTC : 11,00/)
    assert.match(partial, /ENCAISSE : 6,00/)
    assert.match(partial, /RESTE DU : 5,00/)
    assert.doesNotMatch(partial, /ENCAISSE : 9,00/)

    // Un paiement supplémentaire est enregistré après
    // la première lecture du ticket.
    await db.transaction(
      'rw',
      db.payments,
      db.paymentAllocations,
      async () => {
        await db.payments.add({
          id: 'payment-final',
          createdAt: now,
          method: 'card',
          amountCents: 500,
          cardConfirmed: true,
        })

        await db.paymentAllocations.add({
          id: 'allocation-3',
          paymentId: 'payment-final',
          orderId,
          amountCents: 500,
        })
      },
    )

    const paid = await loadCustomerReceipt(orderId)

    assert.match(paid, /ENCAISSE : 11,00/)
    assert.match(paid, /RESTE DU : 0,00/)
    assert.match(paid, /Carte : 5,00/)

    // Une référence manquante doit empêcher
    // l'affichage d'un ticket incohérent.
    await db.payments.delete('payment-final')

    await assert.rejects(
      loadCustomerReceipt(orderId),
      /Paiement référencé introuvable/,
    )

    console.log(
      'INDEXEDDB : paiement groupe, actualisation et ' +
      'incoherence controles',
    )
  } finally {
    await db.delete()
  }
})
