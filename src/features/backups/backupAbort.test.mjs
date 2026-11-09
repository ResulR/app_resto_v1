import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/backups/backupRuntime.ts',
  'utf8',
)

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const HASH = 'a'.repeat(64)

function envelope() {
  return {
    sha256: HASH,
    body: '{}',
    snapshot: { formatVersion: 1 },
  }
}

function setup(uploadHandler) {
  let pendingLogout = false
  let authenticated = true
  let confirms = 0
  let uploads = 0

  const previousWindow = globalThis.window

  const storage = {
    getItem() {
      return pendingLogout ? 'pending' : null
    },
  }

  globalThis.window = {
    localStorage: storage,
  }

  const imports = {
    './backupCoordinator': {
      BackupCoordinator: class {
        constructor(dependencies) {
          this.dependencies = dependencies
        }
      },
    },

    './backupOutbox': {
      async getPendingBackup() {
        return envelope()
      },
      async stagePendingBackup(value) {
        return value
      },
      async confirmPendingBackup() {
        confirms++
        return true
      },
    },

    './backupUpload': {
      async prepareBackupEnvelope() {
        return envelope()
      },
      async uploadBackup(value, send, signal) {
        uploads++
        assert.equal(typeof send, 'function')

        return uploadHandler(value, signal)
      },
    },

    './snapshotRepository': {
      async createRestaurantSnapshot() {
        return { formatVersion: 1 }
      },
    },

    '../auth/authClient': {
      async getAdminSession() {
        return authenticated
      },
    },

    '../auth/logoutFlow': {
      hasPendingLogout(value) {
        assert.equal(value, storage)
        return pendingLogout
      },
    },
  }

  const exported = {}

  new Function('exports', 'require', compiled)(
    exported,
    name => {
      if (!(name in imports)) {
        throw new Error('Import inattendu : ' + name)
      }

      return imports[name]
    },
  )

  return {
    runtime: exported.createBackupRuntime(),
    abort: exported.abortActiveBackupUpload,

    setPendingLogout(value) {
      pendingLogout = value
    },

    setAuthenticated(value) {
      authenticated = value
    },

    get confirms() {
      return confirms
    },

    get uploads() {
      return uploads
    },

    restore() {
      if (previousWindow === undefined) {
        delete globalThis.window
      } else {
        globalThis.window = previousWindow
      }
    },
  }
}

test('annulation HTTP conserve la sauvegarde en attente', async () => {
  let started

  const uploadStarted = new Promise(resolve => {
    started = resolve
  })

  const state = setup(async (_value, signal) => {
    return new Promise((_resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Annulée', 'AbortError'))
        return
      }

      signal.addEventListener(
        'abort',
        () => {
          reject(new DOMException('Annulée', 'AbortError'))
        },
        { once: true },
      )

      started()
    })
  })

  try {
    const pending = await state.runtime.dependencies.capture()
    const transmission = state.runtime.dependencies.send(pending)

    await uploadStarted

    state.setPendingLogout(true)
    state.abort()

    await assert.rejects(
      transmission,
      error => error.name === 'AbortError',
    )

    assert.equal(state.uploads, 1)
    assert.equal(state.confirms, 0)
  } finally {
    state.restore()
  }
})

test('déconnexion pendant vérification empêche le réseau', async () => {
  const state = setup(async () => {
    throw new Error('Envoi interdit')
  })

  try {
    const pending = await state.runtime.dependencies.capture()

    // L'autorisation n'est plus valable.
    state.setPendingLogout(true)

    await assert.rejects(
      state.runtime.dependencies.send(pending),
      /Transmission interdite/,
    )

    assert.equal(state.uploads, 0)
    assert.equal(state.confirms, 0)
  } finally {
    state.restore()
  }
})

test('session expirée empêche toute transmission', async () => {
  const state = setup(async () => {
    throw new Error('Envoi interdit')
  })

  try {
    state.setAuthenticated(false)

    const pending = await state.runtime.dependencies.capture()

    await assert.rejects(
      state.runtime.dependencies.send(pending),
      /Transmission interdite/,
    )

    assert.equal(state.uploads, 0)
    assert.equal(state.confirms, 0)
  } finally {
    state.restore()
  }
})

test('réponse reçue après annulation ne vide pas la file', async () => {
  let resolveUpload
  let started

  const uploadStarted = new Promise(resolve => {
    started = resolve
  })

  const state = setup(async (_value, signal) => {
    return new Promise(resolve => {
      resolveUpload = resolve
      assert.equal(signal.aborted, false)
      started()
    })
  })

  try {
    const pending = await state.runtime.dependencies.capture()
    const transmission = state.runtime.dependencies.send(pending)

    await uploadStarted

    state.setPendingLogout(true)
    state.abort()

    // Simule une réponse serveur arrivée trop tard.
    resolveUpload({
      id: '12345678-1234-8234-8234-123456789abc',
      sha256: HASH,
      stored: true,
      duplicate: false,
    })

    await assert.rejects(
      transmission,
      /Sauvegarde interrompue/,
    )

    assert.equal(state.confirms, 0)
  } finally {
    state.restore()
  }
})

test('envoi normal confirmé et contrôleur libéré', async () => {
  const state = setup(async (_value, signal) => {
    assert.equal(signal.aborted, false)

    return {
      id: '12345678-1234-8234-8234-123456789abc',
      sha256: HASH,
      stored: true,
      duplicate: false,
    }
  })

  try {
    const pending = await state.runtime.dependencies.capture()

    await state.runtime.dependencies.send(pending)

    assert.equal(state.confirms, 1)

    // Une annulation tardive ne doit pas bloquer
    // la prochaine transmission.
    state.abort()

    await state.runtime.dependencies.send(pending)

    assert.equal(state.confirms, 2)
  } finally {
    state.restore()
  }
})
