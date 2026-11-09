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

function setup({
  authenticated = true,
  pendingLogout = false,
  sessionCheck,
} = {}) {
  let pending = pendingLogout
  let sessionCalls = 0

  const originalWindow = globalThis.window

  const storage = {
    getItem() {
      return pending ? 'pending' : null
    },
  }

  globalThis.window = {
    localStorage: storage,
  }

  const imports = {
    './backupChangeDetection': {
      async fingerprintBackupData() {
        return 'a'.repeat(64)
      },
      wasBackupDataConfirmed() {
        return false
      },
      markBackupDataConfirmed() {},
    },

    './backupCoordinator': {
      BackupCoordinator: class {},
    },
    './backupOutbox': {},
    './backupUpload': {},
    './snapshotRepository': {},
    '../auth/authClient': {
      async getAdminSession() {
        sessionCalls++

        if (sessionCheck) {
          return sessionCheck()
        }

        return authenticated
      },
    },
    '../auth/logoutFlow': {
      hasPendingLogout(value) {
        assert.equal(value, storage)
        return pending
      },
    },
  }

  const exports = {}

  new Function('exports', 'require', compiled)(
    exports,
    name => {
      if (!(name in imports)) {
        throw new Error(
          `Import inattendu : ${name}`,
        )
      }

      return imports[name]
    },
  )

  return {
    canUploadBackup: exports.canUploadBackup,

    setPending(value) {
      pending = value
    },

    get sessionCalls() {
      return sessionCalls
    },

    restore() {
      if (originalWindow === undefined) {
        delete globalThis.window
      } else {
        globalThis.window = originalWindow
      }
    },
  }
}

test('session valide : envoi autorisé', async () => {
  const state = setup()

  try {
    assert.equal(
      await state.canUploadBackup(),
      true,
    )

    assert.equal(state.sessionCalls, 1)
  } finally {
    state.restore()
  }
})

test('session expirée : envoi refusé', async () => {
  const state = setup({
    authenticated: false,
  })

  try {
    assert.equal(
      await state.canUploadBackup(),
      false,
    )
  } finally {
    state.restore()
  }
})

test('déconnexion en attente : aucune requête de session', async () => {
  const state = setup({
    pendingLogout: true,
  })

  try {
    assert.equal(
      await state.canUploadBackup(),
      false,
    )

    assert.equal(state.sessionCalls, 0)
  } finally {
    state.restore()
  }
})

test('déconnexion pendant vérification : accès refusé', async () => {
  let release

  const waiting = new Promise(resolve => {
    release = resolve
  })

  const state = setup({
    sessionCheck: async () => {
      await waiting
      return true
    },
  })

  try {
    const verification = state.canUploadBackup()

    state.setPending(true)
    release()

    assert.equal(
      await verification,
      false,
    )
  } finally {
    state.restore()
  }
})

test('erreur serveur : aucune autorisation obtenue', async () => {
  const state = setup({
    sessionCheck: async () => {
      throw new Error('Serveur indisponible')
    },
  })

  try {
    await assert.rejects(
      state.canUploadBackup(),
      /Serveur indisponible/,
    )
  } finally {
    state.restore()
  }
})

test('stockage inaccessible : échec sécurisé', async () => {
  const state = setup()

  const originalStorage = globalThis.window.localStorage

  Object.defineProperty(
    globalThis.window,
    'localStorage',
    {
      configurable: true,
      get() {
        throw new Error('Stockage inaccessible')
      },
    },
  )

  try {
    await assert.rejects(
      state.canUploadBackup(),
      /Stockage inaccessible/,
    )
  } finally {
    Object.defineProperty(
      globalThis.window,
      'localStorage',
      {
        configurable: true,
        value: originalStorage,
      },
    )

    state.restore()
  }
})
