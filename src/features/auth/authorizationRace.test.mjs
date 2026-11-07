import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/auth/accessController.ts',
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

const authorize = exported.authorizeForCurrentVerification

test('vérification valide : autorisation conservée', async () => {
  let grants = 0
  let revocations = 0

  await authorize(
    () => true,
    () => false,
    async () => { grants++ },
    async () => { revocations++ },
  )

  assert.equal(grants, 1)
  assert.equal(revocations, 0)
})

test('déconnexion déjà demandée : aucune écriture', async () => {
  let grants = 0

  await assert.rejects(
    authorize(
      () => true,
      () => true,
      async () => { grants++ },
      async () => {},
    ),
    /obsolète/,
  )

  assert.equal(grants, 0)
})

test('ancienne vérification : aucune écriture', async () => {
  let grants = 0

  await assert.rejects(
    authorize(
      () => false,
      () => false,
      async () => { grants++ },
      async () => {},
    ),
    /obsolète/,
  )

  assert.equal(grants, 0)
})

test('déconnexion pendant IndexedDB : autorisation annulée', async () => {
  let finishGrant
  let pending = false
  let authorized = false
  let revoked = false

  const operation = authorize(
    () => true,
    () => pending,
    async () => {
      await new Promise(resolve => {
        finishGrant = resolve
      })
      authorized = true
    },
    async () => {
      authorized = false
      revoked = true
    },
  )

  // Simule une déconnexion pendant l'écriture.
  pending = true
  finishGrant()

  await assert.rejects(operation, /annulée/)

  assert.equal(revoked, true)
  assert.equal(authorized, false)
})

test('vérification remplacée pendant IndexedDB : annulation', async () => {
  let finishGrant
  let current = true
  let authorized = false

  const operation = authorize(
    () => current,
    () => false,
    async () => {
      await new Promise(resolve => {
        finishGrant = resolve
      })
      authorized = true
    },
    async () => {
      authorized = false
    },
  )

  current = false
  finishGrant()

  await assert.rejects(operation, /annulée/)
  assert.equal(authorized, false)
})
