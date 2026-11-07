import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/auth/logoutFlow.ts',
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
  PENDING_LOGOUT_KEY,
  hasPendingLogout,
  beginLogout,
  completePendingLogout,
} = exported

function makeFixture() {
  const values = new Map()
  const events = []

  const storage = {
    getItem(key) {
      return values.has(key)
        ? values.get(key)
        : null
    },
    setItem(key, value) {
      values.set(key, value)
      events.push('mark-pending')
    },
    removeItem(key) {
      values.delete(key)
      events.push('clear-marker')
    },
  }

  const dependencies = {
    storage,
    async clearOfflineAuthorization() {
      events.push('clear-local')
    },
    async revokeServerSession() {
      events.push('revoke-server')
    },
  }

  return {
    values,
    events,
    storage,
    dependencies,
  }
}

test('déconnexion en ligne : révocation confirmée', async () => {
  const fixture = makeFixture()

  assert.deepEqual(
    await beginLogout(fixture.dependencies),
    { status: 'revoked' },
  )

  assert.equal(
    hasPendingLogout(fixture.storage),
    false,
  )

  assert.deepEqual(fixture.events, [
    'mark-pending',
    'clear-local',
    'revoke-server',
    'clear-marker',
  ])
})

test('déconnexion hors ligne : révocation en attente', async () => {
  const fixture = makeFixture()

  fixture.dependencies.revokeServerSession =
    async () => {
      fixture.events.push('network-error')
      throw new Error('offline')
    }

  assert.deepEqual(
    await beginLogout(fixture.dependencies),
    { status: 'pending' },
  )

  assert.equal(
    hasPendingLogout(fixture.storage),
    true,
  )

  assert.ok(
    fixture.values.has(PENDING_LOGOUT_KEY),
  )
})

test('reconnexion : révocation en attente terminée', async () => {
  const fixture = makeFixture()

  fixture.storage.setItem(
    PENDING_LOGOUT_KEY,
    'pending',
  )

  assert.deepEqual(
    await completePendingLogout(
      fixture.dependencies,
    ),
    { status: 'revoked' },
  )

  assert.equal(
    hasPendingLogout(fixture.storage),
    false,
  )
})

test('reconnexion encore hors ligne : verrouillage conservé', async () => {
  const fixture = makeFixture()

  fixture.storage.setItem(
    PENDING_LOGOUT_KEY,
    'pending',
  )

  fixture.dependencies.revokeServerSession =
    async () => {
      throw new Error('offline')
    }

  assert.deepEqual(
    await completePendingLogout(
      fixture.dependencies,
    ),
    { status: 'pending' },
  )

  assert.equal(
    hasPendingLogout(fixture.storage),
    true,
  )
})

test('aucune révocation en attente : aucune action', async () => {
  const fixture = makeFixture()

  assert.equal(
    await completePendingLogout(
      fixture.dependencies,
    ),
    null,
  )

  assert.deepEqual(
    fixture.events,
    [],
  )
})

test('stockage indisponible : déconnexion non confirmée', async () => {
  const fixture = makeFixture()

  fixture.dependencies.storage.setItem =
    () => {
      throw new Error('stockage indisponible')
    }

  await assert.rejects(
    beginLogout(fixture.dependencies),
    /stockage indisponible/,
  )

  assert.deepEqual(
    fixture.events,
    [],
  )
})

test('suppression locale impossible : verrouillage conservé', async () => {
  const fixture = makeFixture()

  fixture.dependencies.clearOfflineAuthorization =
    async () => {
      throw new Error('IndexedDB inaccessible')
    }

  await assert.rejects(
    beginLogout(fixture.dependencies),
    /IndexedDB inaccessible/,
  )

  assert.equal(
    hasPendingLogout(fixture.storage),
    true,
  )

  assert.ok(
    !fixture.events.includes('revoke-server'),
  )
})
