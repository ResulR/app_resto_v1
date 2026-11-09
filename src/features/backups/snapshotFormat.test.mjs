import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/backups/snapshotFormat.ts',
  'utf8',
)

const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const exported = {}

new Function('exports', output)(exported)

const {
  SNAPSHOT_TABLES,
  SNAPSHOT_VERSION,
  MAX_SNAPSHOT_BYTES,
  validateSnapshot,
} = exported

function validSnapshot() {
  return {
    formatVersion: SNAPSHOT_VERSION,
    capturedAt: new Date().toISOString(),
    tables: Object.fromEntries(
      SNAPSHOT_TABLES.map(name => [name, []]),
    ),
  }
}

test('les neuf tables sont couvertes', () => {
  assert.equal(SNAPSHOT_TABLES.length, 9)

  assert.ok(SNAPSHOT_TABLES.includes('orders'))
  assert.ok(SNAPSHOT_TABLES.includes('drafts'))
  assert.ok(SNAPSHOT_TABLES.includes('settings'))
})

test('instantané vide valide', () => {
  assert.doesNotThrow(
    () => validateSnapshot(validSnapshot()),
  )
})

test('commande et catalogue valides', () => {
  const snapshot = validSnapshot()

  snapshot.tables.orders.push({
    id: 'order-1',
    status: 'validated',
  })

  snapshot.tables.products.push({
    id: 'product-1',
    name: 'Panini',
  })

  assert.doesNotThrow(
    () => validateSnapshot(snapshot),
  )
})

test('table absente refusée', () => {
  const snapshot = validSnapshot()

  delete snapshot.tables.orders

  assert.throws(
    () => validateSnapshot(snapshot),
    /tables incohérente/,
  )
})

test('table supplémentaire refusée', () => {
  const snapshot = validSnapshot()

  snapshot.tables.unknown = []

  assert.throws(
    () => validateSnapshot(snapshot),
    /tables incohérente/,
  )
})

test('version inconnue refusée', () => {
  const snapshot = validSnapshot()

  snapshot.formatVersion = 999

  assert.throws(
    () => validateSnapshot(snapshot),
    /Version/,
  )
})

test('identifiants dupliqués refusés', () => {
  const snapshot = validSnapshot()

  snapshot.tables.orders.push(
    { id: 'same-id' },
    { id: 'same-id' },
  )

  assert.throws(
    () => validateSnapshot(snapshot),
    /dupliqué/,
  )
})

test('paramètres identifiés par key', () => {
  const snapshot = validSnapshot()

  snapshot.tables.settings.push({
    key: 'example',
    value: 'test',
  })

  assert.doesNotThrow(
    () => validateSnapshot(snapshot),
  )
})

test('enregistrement sans identifiant refusé', () => {
  const snapshot = validSnapshot()

  snapshot.tables.products.push({
    name: 'Produit sans identifiant',
  })

  assert.throws(
    () => validateSnapshot(snapshot),
    /Identifiant invalide/,
  )
})

test('sauvegarde trop volumineuse refusée', () => {
  const snapshot = validSnapshot()

  snapshot.tables.products.push({
    id: 'large-product',
    description: 'x'.repeat(MAX_SNAPSHOT_BYTES),
  })

  assert.throws(
    () => validateSnapshot(snapshot),
    /volumineuse/,
  )
})
