import ts from 'typescript'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/orders/ticket.ts',
  'utf8',
)

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const exports = {}

new Function('exports', 'require', compiled)(
  exports,
  () => {
    throw new Error('Import runtime inattendu')
  },
)

const { createPreparationTicket } = exports

const order = {
  id: '12345678-1234-4123-8123-123456789abc',
  createdAt: '2026-11-07T12:00:00.000Z',
  status: 'validated',
  items: [
    {
      id: 'item-1',
      productId: 'product-1',
      name: 'Panini poulet',
      priceCents: 650,
      quantity: 2,
      note: 'Bien cuit',
      options: [
        {
          id: 'option-1',
          groupName: 'Sauces',
          name: 'Andalouse',
          priceCents: 50,
        },
      ],
    },
    {
      id: 'item-2',
      productId: 'free:item-2',
      name: 'Produit libre',
      quantity: 1,
      note: '',
      options: [],
    },
  ],
  comment: 'Commande à préparer rapidement',
  consumptionMode: 'emporter',
  knownTotalCents: 1400,
  totalComplete: false,
}

console.log('1. Génération du ticket')

const before = structuredClone(order)
const ticket = createPreparationTicket(order)

assert.ok(ticket.includes('TICKET DE PRÉPARATION'))
assert.ok(ticket.includes('FIN DU TICKET'))

console.log('OK : ticket généré')

console.log('2. Identification')

assert.ok(
  ticket.includes(order.id.toUpperCase()),
)

assert.ok(ticket.includes('Date :'))

console.log('OK : numéro complet et date')

console.log('3. Articles et quantités')

assert.ok(ticket.includes('2 × Panini poulet'))
assert.ok(ticket.includes('1 × Produit libre'))

console.log('OK : produits classiques et libres')

console.log('4. Options')

assert.ok(
  ticket.includes('Sauces : Andalouse'),
)

console.log('OK : options conservées')

console.log('5. Notes et commentaire')

assert.ok(ticket.includes('NOTE : Bien cuit'))
assert.ok(
  ticket.includes('Commande à préparer rapidement'),
)

console.log('OK : notes affichées')

console.log('6. Mode de consommation')

assert.ok(ticket.includes('À EMPORTER'))

const dineIn = createPreparationTicket({
  ...order,
  consumptionMode: 'sur_place',
})

assert.ok(dineIn.includes('SUR PLACE'))

const unspecified = createPreparationTicket({
  ...order,
  consumptionMode: null,
})

assert.ok(unspecified.includes('NON PRÉCISÉ'))

console.log('OK : trois modes traités')

console.log('7. Aucun prix sur le ticket')

assert.ok(!ticket.includes('6,50'))
assert.ok(!ticket.includes('14,00'))
assert.ok(!ticket.includes('650'))
assert.ok(!ticket.includes('1400'))

console.log('OK : ticket de préparation sans prix')

console.log('8. Données immuables')

assert.deepEqual(order, before)

console.log('OK : aucune modification de la commande')

console.log('9. Aperçu disponible dans les deux vues')

const active = readFileSync(
  'src/features/orders/ActiveOrders.tsx',
  'utf8',
)

const completed = readFileSync(
  'src/features/orders/CompletedOrders.tsx',
  'utf8',
)

assert.ok(active.includes('<TicketPreview order={order} />'))
assert.ok(completed.includes('<TicketPreview order={order} />'))

console.log('OK : aperçu dans les commandes actives et terminées')

console.log('=== TESTS 6.1 RÉUSSIS ===')
