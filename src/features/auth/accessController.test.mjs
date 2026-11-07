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

const exports = {}

new Function('exports', output)(exports)

const { resolveAccess } = exports

function dependencies(overrides = {}) {
  const events = []

  return {
    events,
    services: {
      async checkServerSession() {
        events.push('check-session')
        return true
      },

      async authorizeOfflineDevice() {
        events.push('authorize-local')
      },

      async hasOfflineAuthorization() {
        events.push('check-local')
        return false
      },

      async clearOfflineAuthorization() {
        events.push('clear-local')
      },

      ...overrides,
    },
  }
}

test('session valide : accès et autorisation locale', async () => {
  const { services, events } = dependencies()

  assert.deepEqual(
    await resolveAccess(services),
    { status: 'online', offlineReady: true },
  )

  assert.deepEqual(events, [
    'check-session',
    'authorize-local',
  ])
})

test('session refusée : accès verrouillé', async () => {
  const { services, events } = dependencies({
    async checkServerSession() {
      events.push('check-session')
      return false
    },
  })

  assert.deepEqual(
    await resolveAccess(services),
    {
      status: 'locked',
      reason: 'session-invalid',
    },
  )

  assert.deepEqual(events, [
    'check-session',
    'clear-local',
  ])
})

test('serveur indisponible et appareil autorisé', async () => {
  const { services } = dependencies({
    async checkServerSession() {
      throw new TypeError('Failed to fetch')
    },
    async hasOfflineAuthorization() {
      return true
    },
  })

  assert.deepEqual(
    await resolveAccess(services),
    { status: 'offline' },
  )
})

test('serveur indisponible et appareil inconnu', async () => {
  const { services } = dependencies({
    async checkServerSession() {
      throw new TypeError('Failed to fetch')
    },
  })

  assert.deepEqual(
    await resolveAccess(services),
    {
      status: 'locked',
      reason: 'offline-unavailable',
    },
  )
})

test('stockage local indisponible : session serveur maintenue', async () => {
  const { services } = dependencies({
    async authorizeOfflineDevice() {
      throw new Error('IndexedDB inaccessible')
    },
  })

  assert.deepEqual(
    await resolveAccess(services),
    {
      status: 'online',
      offlineReady: false,
    },
  )
})

test('erreur de suppression locale : ne pas autoriser l’accès', async () => {
  const { services } = dependencies({
    async checkServerSession() {
      return false
    },
    async clearOfflineAuthorization() {
      throw new Error('suppression impossible')
    },
  })

  await assert.rejects(
    resolveAccess(services),
    /suppression impossible/,
  )
})

test('erreur HTTP 503 : aucun accès hors ligne', async () => {
  const events = []

  const { services } = dependencies({
    async checkServerSession() {
      events.push('http-503')
      throw new Error(
        'Impossible de vérifier la session.',
      )
    },
    async hasOfflineAuthorization() {
      events.push('check-local')
      return true
    },
  })

  assert.deepEqual(
    await resolveAccess(services),
    {
      status: 'locked',
      reason: 'offline-unavailable',
    },
  )

  assert.deepEqual(events, ['http-503'])
})

test('réponse serveur invalide : aucun accès hors ligne', async () => {
  const events = []

  const { services } = dependencies({
    async checkServerSession() {
      events.push('invalid-json')
      throw new SyntaxError('Invalid JSON')
    },
    async hasOfflineAuthorization() {
      events.push('check-local')
      return true
    },
  })

  assert.deepEqual(
    await resolveAccess(services),
    {
      status: 'locked',
      reason: 'offline-unavailable',
    },
  )

  assert.deepEqual(events, ['invalid-json'])
})

test('stockage hors ligne inaccessible : accès refusé', async () => {
  const { services } = dependencies({
    async checkServerSession() {
      throw new TypeError('Failed to fetch')
    },
    async hasOfflineAuthorization() {
      throw new Error('IndexedDB inaccessible')
    },
  })

  assert.deepEqual(
    await resolveAccess(services),
    {
      status: 'locked',
      reason: 'offline-unavailable',
    },
  )
})
