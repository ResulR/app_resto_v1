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

const { resolveGuardedAccess } = exported

function accessDependencies(events) {
  return {
    async checkServerSession() {
      events.push('check-session')
      return true
    },
    async authorizeOfflineDevice() {
      events.push('authorize-device')
    },
    async hasOfflineAuthorization() {
      events.push('check-offline')
      return true
    },
    async clearOfflineAuthorization() {
      events.push('clear-offline')
    },
  }
}

test('déconnexion en attente : aucune réouverture', async () => {
  const events = []

  const result = await resolveGuardedAccess(
    accessDependencies(events),
    {
      hasPendingLogout() {
        events.push('check-pending')
        return true
      },
      async completePendingLogout() {
        events.push('revoke-session')
        return { status: 'pending' }
      },
    },
  )

  assert.equal(result.status, 'locked')
  assert.deepEqual(events, [
    'check-pending',
    'revoke-session',
  ])
})

test('révocation terminée : nouvelle connexion requise', async () => {
  const events = []

  const result = await resolveGuardedAccess(
    accessDependencies(events),
    {
      hasPendingLogout() {
        events.push('check-pending')
        return true
      },
      async completePendingLogout() {
        events.push('revoke-session')
        return { status: 'revoked' }
      },
    },
  )

  assert.equal(result.status, 'locked')
  assert.ok(!events.includes('check-session'))
})

test('échec révocation : accès refusé', async () => {
  const events = []

  const result = await resolveGuardedAccess(
    accessDependencies(events),
    {
      hasPendingLogout() {
        return true
      },
      async completePendingLogout() {
        throw new Error('réseau indisponible')
      },
    },
  )

  assert.equal(result.status, 'locked')
  assert.deepEqual(events, [])
})

test('stockage inaccessible : accès refusé', async () => {
  const events = []

  const result = await resolveGuardedAccess(
    accessDependencies(events),
    {
      hasPendingLogout() {
        throw new Error('stockage inaccessible')
      },
      async completePendingLogout() {},
    },
  )

  assert.equal(result.status, 'locked')
  assert.deepEqual(events, [])
})

test('aucune révocation : session normale autorisée', async () => {
  const events = []

  const result = await resolveGuardedAccess(
    accessDependencies(events),
    {
      hasPendingLogout() {
        events.push('check-pending')
        return false
      },
      async completePendingLogout() {
        throw new Error('ne doit pas être appelé')
      },
    },
  )

  assert.deepEqual(result, {
    status: 'online',
    offlineReady: true,
  })

  assert.deepEqual(events, [
    'check-pending',
    'check-session',
    'authorize-device',
  ])
})
