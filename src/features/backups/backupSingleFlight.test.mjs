import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/backups/backupSingleFlight.ts',
  'utf8',
)

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const exported = {}

new Function('exports', compiled)(exported)

const {
  runWithBackupLock,
  BACKUP_LOCK_NAME,
} = exported

function manager() {
  let locked = false
  let calls = 0

  return {
    async request(name, options, callback) {
      calls++

      assert.equal(name, BACKUP_LOCK_NAME)
      assert.equal(options.mode, 'exclusive')
      assert.equal(options.ifAvailable, true)

      if (locked) {
        return callback(null)
      }

      locked = true

      try {
        return await callback({ name })
      } finally {
        locked = false
      }
    },

    get calls() {
      return calls
    },
  }
}

test('opération autorisée avec verrou exclusif', async () => {
  const locks = manager()
  let runs = 0

  const result = await runWithBackupLock(
    async () => {
      runs++
      return 'sauvegarde-confirmée'
    },
    locks,
  )

  assert.deepEqual(result, {
    status: 'completed',
    value: 'sauvegarde-confirmée',
  })

  assert.equal(runs, 1)
})

test('deuxième demande refusée pendant la première', async () => {
  const locks = manager()

  let release
  let started

  const held = new Promise(resolve => {
    release = resolve
  })

  const entered = new Promise(resolve => {
    started = resolve
  })

  let secondExecuted = false

  const first = runWithBackupLock(
    async () => {
      started()
      await held
      return 1
    },
    locks,
  )

  await entered

  const second = await runWithBackupLock(
    async () => {
      secondExecuted = true
      return 2
    },
    locks,
  )

  assert.deepEqual(second, {
    status: 'busy',
  })

  assert.equal(secondExecuted, false)

  release()

  assert.deepEqual(await first, {
    status: 'completed',
    value: 1,
  })
})

test('verrou libéré après réussite', async () => {
  const locks = manager()

  const first = await runWithBackupLock(
    async () => 1,
    locks,
  )

  const second = await runWithBackupLock(
    async () => 2,
    locks,
  )

  assert.equal(first.status, 'completed')
  assert.equal(second.status, 'completed')
  assert.equal(locks.calls, 2)
})

test('verrou libéré après erreur', async () => {
  const locks = manager()

  await assert.rejects(
    runWithBackupLock(
      async () => {
        throw new Error('Connexion perdue')
      },
      locks,
    ),
    /Connexion perdue/,
  )

  const next = await runWithBackupLock(
    async () => 'reprise',
    locks,
  )

  assert.deepEqual(next, {
    status: 'completed',
    value: 'reprise',
  })
})

test('absence de Web Locks : aucun envoi', async () => {
  let executed = false

  const result = await runWithBackupLock(
    async () => {
      executed = true
    },
    null,
  )

  assert.deepEqual(result, {
    status: 'unsupported',
  })

  assert.equal(executed, false)
})

test('gestionnaire invalide : aucun envoi', async () => {
  let executed = false

  const result = await runWithBackupLock(
    async () => {
      executed = true
    },
    {},
  )

  assert.equal(result.status, 'unsupported')
  assert.equal(executed, false)
})

test('échec du gestionnaire propagé', async () => {
  const locks = {
    async request() {
      throw new Error('Web Locks indisponible')
    },
  }

  await assert.rejects(
    runWithBackupLock(
      async () => {
        throw new Error('Ne doit pas démarrer')
      },
      locks,
    ),
    /Web Locks indisponible/,
  )
})
