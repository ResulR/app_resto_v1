import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/backups/backupLockedRuntime.ts',
  'utf8',
)

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const exports = {}

const mockImports = {
  './backupRuntime': {
    createBackupRuntime() {
      throw new Error(
        'Runtime réel interdit dans les tests isolés',
      )
    },
  },
  './backupSingleFlight': {
    runWithBackupLock() {
      throw new Error(
        'Gestionnaire réel interdit dans les tests isolés',
      )
    },
  },
}

new Function('exports', 'require', compiled)(
  exports,
  name => {
    assert.ok(
      Object.hasOwn(mockImports, name),
      'Import inattendu : ' + name,
    )

    return mockImports[name]
  },
)

const { createLockedBackupRuntime } = exports

function createLocks() {
  let occupied = false

  return async function executeWithLock(operation) {
    if (occupied) {
      return { status: 'busy' }
    }

    occupied = true

    try {
      return {
        status: 'completed',
        value: await operation(),
      }
    } finally {
      occupied = false
    }
  }
}

test('tentative exécutée sous verrou', async () => {
  let runs = 0

  const runtime = {
    async attempt() {
      runs++
      return 'sent'
    },
  }

  const locked = createLockedBackupRuntime(
    runtime,
    createLocks(),
  )

  assert.deepEqual(
    await locked.attempt(),
    {
      status: 'completed',
      value: 'sent',
    },
  )

  assert.equal(runs, 1)
})

test('deuxième tentative bloquée avant le runtime', async () => {
  let release
  let entered

  const waiting = new Promise(resolve => {
    release = resolve
  })

  const started = new Promise(resolve => {
    entered = resolve
  })

  let runs = 0

  const runtime = {
    async attempt() {
      runs++
      entered()
      await waiting
      return 'sent'
    },
  }

  const locks = createLocks()

  const firstTab = createLockedBackupRuntime(
    runtime,
    locks,
  )

  const secondTab = createLockedBackupRuntime(
    runtime,
    locks,
  )

  const first = firstTab.attempt()

  await started

  const second = await secondTab.attempt()

  assert.deepEqual(second, {
    status: 'busy',
  })

  assert.equal(runs, 1)

  release()

  assert.deepEqual(await first, {
    status: 'completed',
    value: 'sent',
  })
})

test('verrou libéré après échec de transmission', async () => {
  let fail = true
  let runs = 0

  const runtime = {
    async attempt() {
      runs++

      if (fail) {
        throw new Error('Erreur réseau')
      }

      return 'sent'
    },
  }

  const locked = createLockedBackupRuntime(
    runtime,
    createLocks(),
  )

  await assert.rejects(
    locked.attempt(),
    /Erreur réseau/,
  )

  fail = false

  assert.deepEqual(
    await locked.attempt(),
    {
      status: 'completed',
      value: 'sent',
    },
  )

  assert.equal(runs, 2)
})

test('Web Locks indisponible : aucun runtime', async () => {
  let runs = 0

  const locked = createLockedBackupRuntime(
    {
      async attempt() {
        runs++
        return 'sent'
      },
    },
    async () => ({
      status: 'unsupported',
    }),
  )

  assert.deepEqual(
    await locked.attempt(),
    { status: 'unsupported' },
  )

  assert.equal(runs, 0)
})

test('verrou occupé : aucune vérification de session', async () => {
  let runs = 0

  const locked = createLockedBackupRuntime(
    {
      async attempt() {
        runs++
        return 'unauthorized'
      },
    },
    async () => ({
      status: 'busy',
    }),
  )

  assert.deepEqual(
    await locked.attempt(),
    { status: 'busy' },
  )

  assert.equal(runs, 0)
})

test('échec métier propagé sans confusion', async () => {
  const locked = createLockedBackupRuntime(
    {
      async attempt() {
        return 'failed'
      },
    },
    createLocks(),
  )

  assert.deepEqual(
    await locked.attempt(),
    {
      status: 'completed',
      value: 'failed',
    },
  )
})
