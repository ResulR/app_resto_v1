import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function load(filename, dependencies = {}) {
  const source = readFileSync(filename, 'utf8')

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const exports = {}

  new Function('exports', 'require', compiled)(
    exports,
    name => {
      if (name === '../../shared/database/db') {
        return { db }
      }

      if (name in dependencies) {
        return dependencies[name]
      }

      return require(name)
    },
  )

  return exports
}

const db = new Dexie('restaurant-test-storage-53')

const schemaV1 = {
  categories: 'id, position, active',
  products: 'id, categoryId, position, active',
  variants: 'id, productId, position',
  optionGroups: 'id, position',
  productOptionGroups:
    'id, productId, groupId, [productId+groupId]',
  options: 'id, groupId, position, active',
  drafts: 'id, updatedAt',
}

db.version(1).stores(schemaV1)

const item = {
  id: 'item-53',
  productId: 'produit-53',
  name: 'Panini poulet',
  priceCents: 650,
  quantity: 2,
  note: 'Bien cuit',
  options: [{
    id: 'option-53',
    groupName: 'Sauces',
    name: 'Andalouse',
    priceCents: 50,
  }],
}

const input = {
  id: crypto.randomUUID(),
  items: [item],
  comment: 'Commande de test 5.3',
  consumptionMode: 'emporter',
}

try {
  console.log('1. Création des données en schéma v1')

  await db.categories.add({
    id: 'cat-53',
    name: 'Paninis',
    position: 0,
    active: true,
  })

  await db.products.add({
    id: 'produit-53',
    categoryId: 'cat-53',
    name: 'Panini poulet',
    priceCents: 650,
    position: 0,
    active: true,
  })

  await db.drafts.add({
    id: 'draft-53',
    updatedAt: new Date().toISOString(),
    payload: {
      id: 'draft-53',
      updatedAt: new Date().toISOString(),
      items: [structuredClone(item)],
      comment: 'En attente',
      consumptionMode: null,
    },
  })

  assert.equal(await db.categories.count(), 1)
  assert.equal(await db.products.count(), 1)
  assert.equal(await db.drafts.count(), 1)

  console.log('OK : catalogue et brouillon créés')

  console.log('2. Migration vers le schéma v2')

  db.close()

  db.version(2).stores({
    orders: 'id, createdAt',
  })

  await db.open()

  assert.equal(await db.categories.count(), 1)
  assert.equal(await db.products.count(), 1)
  assert.equal(await db.drafts.count(), 1)
  assert.equal(await db.table('orders').count(), 0)

  console.log('OK : migration non destructive')

  console.log('3. Enregistrement d’une commande')

  const pricing = load(
    'src/features/orders/pricing.ts',
  )

  const repository = load(
    'src/features/orders/orderRepository.ts',
    { './pricing': pricing },
  )

  const {
    confirmOrder,
    confirmOrRecoverOrder,
    getConfirmedOrder,
  } = repository

  const saved = await confirmOrder(input)

  assert.equal(saved.knownTotalCents, 1400)
  assert.equal(saved.status, 'validated')
  assert.equal(await db.table('orders').count(), 1)

  console.log('OK : commande persistée')

  console.log('4. Réponse perdue après écriture réussie')

  const recovered = await confirmOrRecoverOrder(input)

  assert.deepEqual(recovered, saved)
  assert.equal(await db.table('orders').count(), 1)

  console.log('OK : commande récupérée sans doublon')

  console.log('5. Instantané déjà enregistré protégé')

  const changedInput = {
    ...input,
    items: [{
      ...item,
      name: 'Modification après validation',
    }],
  }

  const unchanged = await confirmOrRecoverOrder(changedInput)

  assert.equal(
    unchanged.items[0].name,
    'Panini poulet',
  )

  assert.equal(await db.table('orders').count(), 1)

  console.log('OK : commande existante jamais modifiée')

  console.log('6. Écriture impossible')

  const failedInput = {
    ...input,
    id: crypto.randomUUID(),
  }

  const quotaFailure = () => {
    throw new DOMException(
      'Stockage plein (simulation)',
      'QuotaExceededError',
    )
  }

  const table = db.table('orders')
  table.hook('creating', quotaFailure)

  try {
    await assert.rejects(
      confirmOrRecoverOrder(failedInput),
      error =>
        error.name === 'QuotaExceededError' ||
        String(error).includes('QuotaExceededError'),
    )
  } finally {
    table.hook('creating').unsubscribe(quotaFailure)
  }

  assert.equal(
    await getConfirmedOrder(failedInput.id),
    undefined,
  )

  assert.equal(await db.table('orders').count(), 1)

  console.log('OK : aucune fausse commande enregistrée')

  console.log('7. Réessai après erreur de stockage')

  const retry = await confirmOrRecoverOrder(failedInput)

  assert.equal(retry.id, failedInput.id)
  assert.equal(await db.table('orders').count(), 2)

  console.log('OK : commande enregistrée après réessai')

  console.log('8. Fermeture et réouverture')

  db.close()
  await db.open()

  const persisted = await getConfirmedOrder(failedInput.id)

  assert.equal(persisted.id, failedInput.id)
  assert.equal(persisted.items[0].name, 'Panini poulet')
  assert.equal(await db.drafts.count(), 1)
  assert.equal(await db.products.count(), 1)

  console.log('OK : commandes, brouillons et catalogue conservés')

  console.log('9. Contrôle de l’interface')

  const app = readFileSync('src/app/App.tsx', 'utf8')

  assert.ok(
    app.includes('await confirmOrRecoverOrder({'),
  )

  assert.ok(
    app.includes('setConfirmedOrder(saved)'),
  )

  assert.ok(
    app.includes('Commande non enregistrée.'),
  )

  assert.ok(
    app.includes('pendingOrderId.current = id'),
  )

  console.log('OK : validation et récupération intégrées')

  console.log('=== TOUS LES TESTS 5.3 RÉUSSIS ===')

} finally {
  await db.delete()
}
