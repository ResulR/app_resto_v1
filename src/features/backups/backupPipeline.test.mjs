import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/backups/backupPipeline.ts',
  'utf8',
)

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const exports = {}

new Function('exports', compiled)(exports)

const { processBackup } = exports

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function envelope(hash = HASH_A) {
  return {
    sha256: hash,
    snapshot: { formatVersion: 1 },
    body: '{"test":true}',
  }
}

function setup() {
  let pending = null
  let captures = 0
  let uploads = 0
  let confirmations = 0
  let shouldFail = false

  const dependencies = {
    async getPending() {
      return pending
    },

    async capture() {
      captures++
      return { formatVersion: 1 }
    },

    async prepare() {
      return envelope()
    },

    async stage(candidate) {
      if (!pending) {
        pending = candidate
      }

      return pending
    },

    async upload(candidate) {
      uploads++

      if (shouldFail) {
        throw new TypeError('Failed to fetch')
      }

      return {
        id: '12345678-1234-8234-8234-123456789abc',
        sha256: candidate.sha256,
        stored: true,
        duplicate: false,
      }
    },

    async confirm(hash) {
      confirmations++

      if (pending?.sha256 !== hash) {
        return false
      }

      pending = null
      return true
    },
  }

  return {
    dependencies,

    setPending(value) {
      pending = value
    },

    setFailure(value) {
      shouldFail = value
    },

    get pending() {
      return pending
    },

    get captures() {
      return captures
    },

    get uploads() {
      return uploads
    },

    get confirmations() {
      return confirmations
    },
  }
}

test('nouvelle sauvegarde créée et confirmée', async () => {
  const state = setup()

  const receipt = await processBackup(
    state.dependencies,
  )

  assert.equal(receipt.sha256, HASH_A)
  assert.equal(state.captures, 1)
  assert.equal(state.uploads, 1)
  assert.equal(state.confirmations, 1)
  assert.equal(state.pending, null)
})

test('sauvegarde en attente prioritaire', async () => {
  const state = setup()

  state.setPending(envelope(HASH_B))

  const receipt = await processBackup(
    state.dependencies,
  )

  assert.equal(receipt.sha256, HASH_B)
  assert.equal(state.captures, 0)
  assert.equal(state.uploads, 1)
  assert.equal(state.pending, null)
})

test('échec réseau conserve la sauvegarde', async () => {
  const state = setup()

  state.setFailure(true)

  await assert.rejects(
    processBackup(state.dependencies),
    /Failed to fetch/,
  )

  assert.equal(state.pending?.sha256, HASH_A)
  assert.equal(state.confirmations, 0)

  state.setFailure(false)

  await processBackup(state.dependencies)

  assert.equal(state.captures, 1)
  assert.equal(state.uploads, 2)
  assert.equal(state.pending, null)
})

test('capture interrompue : aucun envoi', async () => {
  const state = setup()

  state.dependencies.capture = async () => {
    throw new Error('IndexedDB indisponible')
  }

  await assert.rejects(
    processBackup(state.dependencies),
    /IndexedDB indisponible/,
  )

  assert.equal(state.uploads, 0)
  assert.equal(state.pending, null)
})

test('écriture locale obligatoire avant envoi', async () => {
  const state = setup()

  state.dependencies.stage = async () => {
    throw new Error('Stockage saturé')
  }

  await assert.rejects(
    processBackup(state.dependencies),
    /Stockage saturé/,
  )

  assert.equal(state.uploads, 0)
})

test('confirmation serveur incorrecte refusée', async () => {
  const state = setup()

  state.dependencies.upload = async () => ({
    id: '12345678-1234-8234-8234-123456789abc',
    sha256: HASH_B,
    stored: true,
    duplicate: false,
  })

  await assert.rejects(
    processBackup(state.dependencies),
    /incohérente/,
  )

  assert.equal(state.pending?.sha256, HASH_A)
  assert.equal(state.confirmations, 0)
})

test('confirmation locale incorrecte signalée', async () => {
  const state = setup()

  state.dependencies.confirm = async () => false

  await assert.rejects(
    processBackup(state.dependencies),
    /Confirmation locale/,
  )

  assert.equal(state.pending?.sha256, HASH_A)
})

test('nouveaux changements sauvegardés ensuite', async () => {
  const state = setup()

  await processBackup(state.dependencies)

  // Une modification locale a eu lieu depuis.
  state.dependencies.prepare = async () =>
    envelope(HASH_B)

  const second = await processBackup(
    state.dependencies,
  )

  assert.equal(second.sha256, HASH_B)
  assert.equal(state.captures, 2)
  assert.equal(state.uploads, 2)
  assert.equal(state.pending, null)
})

test('sauvegarde créée ailleurs pendant la capture', async () => {
  const state = setup()

  state.dependencies.capture = async () => {
    state.setPending(envelope(HASH_B))
    return { formatVersion: 1 }
  }

  const receipt = await processBackup(
    state.dependencies,
  )

  assert.equal(receipt.sha256, HASH_B)
  assert.equal(state.pending, null)
})
