import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/backups/backupCoordinator.ts',
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

const {
  BackupCoordinator,
  BACKUP_SUCCESS_INTERVAL_MS,
  BACKUP_RETRY_INTERVAL_MS,
} = exports

function setup(overrides = {}) {
  let time = 1_000_000
  let online = true
  let authorized = true
  let captures = 0
  let sends = 0

  const dependencies = {
    isOnline: () => online,
    isAuthorized: async () => authorized,
    capture: async () => {
      captures++
      return { id: 'snapshot-test' }
    },
    send: async () => {
      sends++
    },
    now: () => time,
    ...overrides,
  }

  const coordinator = new BackupCoordinator(
    dependencies,
  )

  return {
    coordinator,
    setOnline(value) {
      online = value
    },
    setAuthorized(value) {
      authorized = value
    },
    advance(ms) {
      time += ms
    },
    get captures() {
      return captures
    },
    get sends() {
      return sends
    },
  }
}

test('sauvegarde autorisée et réussie', async () => {
  const state = setup()

  assert.equal(
    await state.coordinator.attempt(),
    'sent',
  )

  assert.equal(state.captures, 1)
  assert.equal(state.sends, 1)
  assert.equal(state.coordinator.isRunning, false)
})

test('aucun envoi sans Internet', async () => {
  const state = setup()
  state.setOnline(false)

  assert.equal(
    await state.coordinator.attempt(),
    'offline',
  )

  assert.equal(state.captures, 0)
  assert.equal(state.sends, 0)
})

test('aucun envoi sans autorisation', async () => {
  const state = setup()
  state.setAuthorized(false)

  assert.equal(
    await state.coordinator.attempt(),
    'unauthorized',
  )

  assert.equal(state.captures, 0)
  assert.equal(state.sends, 0)
})

test('quinze minutes entre deux réussites', async () => {
  const state = setup()

  assert.equal(
    await state.coordinator.attempt(),
    'sent',
  )

  assert.equal(
    await state.coordinator.attempt(),
    'cooldown',
  )

  state.advance(
    BACKUP_SUCCESS_INTERVAL_MS - 1,
  )

  assert.equal(
    await state.coordinator.attempt(),
    'cooldown',
  )

  state.advance(1)

  assert.equal(
    await state.coordinator.attempt(),
    'sent',
  )

  assert.equal(state.sends, 2)
})

test('échec réseau puis nouvelle tentative', async () => {
  let shouldFail = true
  let sends = 0
  let time = 1_000_000

  const coordinator = new BackupCoordinator({
    isOnline: () => true,
    isAuthorized: async () => true,
    capture: async () => ({ id: 'snapshot' }),
    send: async () => {
      sends++

      if (shouldFail) {
        throw new TypeError('Failed to fetch')
      }
    },
    now: () => time,
  })

  assert.equal(
    await coordinator.attempt(),
    'failed',
  )

  assert.ok(coordinator.error)
  assert.equal(sends, 1)

  assert.equal(
    await coordinator.attempt(),
    'cooldown',
  )

  time += BACKUP_RETRY_INTERVAL_MS
  shouldFail = false

  assert.equal(
    await coordinator.attempt(),
    'sent',
  )

  assert.equal(sends, 2)
  assert.equal(coordinator.error, null)
})

test('une seule sauvegarde simultanée', async () => {
  let releaseCapture

  const capturePending = new Promise(resolve => {
    releaseCapture = resolve
  })

  let sends = 0

  const coordinator = new BackupCoordinator({
    isOnline: () => true,
    isAuthorized: async () => true,
    capture: async () => {
      await capturePending
      return { id: 'snapshot' }
    },
    send: async () => {
      sends++
    },
    now: () => 1_000_000,
  })

  const first = coordinator.attempt()

  assert.equal(coordinator.isRunning, true)

  assert.equal(
    await coordinator.attempt(),
    'busy',
  )

  releaseCapture()

  assert.equal(await first, 'sent')
  assert.equal(sends, 1)
})

test('déconnexion pendant la capture', async () => {
  let authorized = true

  const coordinator = new BackupCoordinator({
    isOnline: () => true,
    isAuthorized: async () => authorized,
    capture: async () => {
      authorized = false
      return { id: 'snapshot' }
    },
    send: async () => {
      throw new Error(
        'Envoi interdit après déconnexion',
      )
    },
    now: () => 1_000_000,
  })

  assert.equal(
    await coordinator.attempt(),
    'unauthorized',
  )
})

test('réseau perdu pendant la capture', async () => {
  let online = true
  let sends = 0

  const coordinator = new BackupCoordinator({
    isOnline: () => online,
    isAuthorized: async () => true,
    capture: async () => {
      online = false
      return { id: 'snapshot' }
    },
    send: async () => {
      sends++
    },
    now: () => 1_000_000,
  })

  assert.equal(
    await coordinator.attempt(),
    'offline',
  )

  assert.equal(sends, 0)
})

test('erreur de capture libère le verrou', async () => {
  let time = 1_000_000

  const coordinator = new BackupCoordinator({
    isOnline: () => true,
    isAuthorized: async () => true,
    capture: async () => {
      throw new Error('IndexedDB indisponible')
    },
    send: async () => {},
    now: () => time,
  })

  assert.equal(
    await coordinator.attempt(),
    'failed',
  )

  assert.equal(coordinator.isRunning, false)

  time += BACKUP_RETRY_INTERVAL_MS

  assert.equal(
    await coordinator.attempt(),
    'failed',
  )
})
