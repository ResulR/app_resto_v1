import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { db } from '../src/shared/database/db'
import {
  recordOrderPayment,
} from '../src/features/checkout/paymentRepository'
import {
  recordMultiOrderPayment,
} from '../src/features/checkout/multiOrderPayment'
import {
  createCustomerReceipt,
} from '../src/features/printing/customerReceipt'

async function seed(
  orderId: string,
  inconsistentUnitPrice: boolean,
) {
  const order = {
    id: orderId,
    createdAt: '2026-11-17T12:00:00.000Z',
    status: 'validated' as const,
    items: [{
      id: `item-${orderId}`,
      productId: 'panini',
      name: 'Panini',
      priceCents: 1000,
      quantity: 1,
      options: [],
      note: '',
    }],
    comment: '',
    consumptionMode: 'emporter' as const,
    knownTotalCents: 1000,
    totalComplete: true,
  }

  const sale = {
    id: `sale-${orderId}`,
    orderId,
    createdAt: order.createdAt,
    status: 'draft' as const,
    consumptionMode: 'emporter' as const,
    totalTtcCents: 1000,
    lines: [{
      itemId: `item-${orderId}`,
      productId: 'panini',
      label: 'Panini',
      quantity: 2,
      unitTtcCents: inconsistentUnitPrice ? 400 : 500,
      lineTtcCents: 1000,
      source: 'catalog' as const,
      taxRateBasisPoints: 0,
      netCents: 1000,
      taxCents: 0,
    }],
    taxBreakdown: [{
      rateBasisPoints: 0,
      totalTtcCents: 1000,
      totalHtCents: 1000,
      taxCents: 0,
    }],
  }

  await db.table('orders').add(order)
  await db.salesValuations.add(sale)

  return { order, sale }
}

test(
  'ARCH-02A : caractérisation des validations fiscales',
  async () => {
    await db.open()

    try {
      // Cas 1 : C4 accepte actuellement une incohérence
      // entre prix unitaire, quantité et total de ligne.
      await seed('arch02a-c4', true)

      const individual = await recordOrderPayment({
        id: '11111111-1111-4111-8111-111111111111',
        orderId: 'arch02a-c4',
        method: 'cash',
        tenderedCents: 300,
      })

      assert.equal(individual.payment.amountCents, 300)
      assert.equal(individual.remainingCents, 700)

      // Cas 2 : C5 refuse la même incohérence.
      await seed('arch02a-c5', true)

      const paymentsBefore = await db.payments.count()
      const allocationsBefore =
        await db.paymentAllocations.count()

      await assert.rejects(
        recordMultiOrderPayment({
          id: '22222222-2222-4222-8222-222222222222',
          orderIds: ['arch02a-c5'],
          method: 'cash',
          tenderedCents: 300,
        }),
        /Ligne fiscale incohérente/,
      )

      assert.equal(
        await db.payments.count(),
        paymentsBefore,
      )

      assert.equal(
        await db.paymentAllocations.count(),
        allocationsBefore,
      )

      // Cas 3 : le ticket refuse aussi cette ligne.
      const { order, sale } =
        await seed('arch02a-ticket', true)

      assert.throws(
        () => createCustomerReceipt(
          order,
          { ...sale, status: 'locked' },
          [],
          [],
        ),
        /Ligne de vente incohérente/,
      )

      // Cas 4 : C5 accepte une ligne fiscalement cohérente.
      await seed('arch02a-valid', false)

      const valid = await recordMultiOrderPayment({
        id: '33333333-3333-4333-8333-333333333333',
        orderIds: ['arch02a-valid'],
        method: 'cash',
        tenderedCents: 300,
      })

      assert.equal(valid.payment.amountCents, 300)
      assert.equal(
        valid.remainingByOrder['arch02a-valid'],
        700,
      )

      console.log(
        'ARCH-02A : comportements actuels caractérisés',
      )
    } finally {
      db.close()
      await db.delete()
    }
  },
)
