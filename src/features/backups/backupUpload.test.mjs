import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Node.js 22 fournit déjà Web Crypto.
// Ne pas modifier globalThis.crypto.

function loadTypeScript(path, imports = {}) {
  const source = readFileSync(path, 'utf8')

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const exports = {}

  new Function('exports', 'require', compiled)(
    exports,
    name => {
      if (!(name in imports)) {
        throw new Error(`Import inattendu : ${name}`)
      }

      return imports[name]
    },
  )

  return exports
}

const format = loadTypeScript(
  'src/features/backups/snapshotFormat.ts',
)

const {
  prepareBackupEnvelope,
  uploadBackup,
} = loadTypeScript(
  'src/features/backups/backupUpload.ts',
  { './snapshotFormat': format },
)

function snapshot() {
  return {
    formatVersion: 1,
    capturedAt: '2026-11-09T10:00:00.000Z',
    tables: Object.fromEntries(
      format.SNAPSHOT_TABLES.map(name => [name, []]),
    ),
  }
}

test('SHA-256 correspond exactement au JSON envoyé', async () => {
    const envelope = await prepareBackupEnvelope(
      snapshot(),
    )

    const parsed = JSON.parse(envelope.body)

    const expected = createHash('sha256')
      .update(JSON.stringify(parsed.snapshot))
      .digest('hex')

    assert.equal(envelope.sha256, expected)
    assert.equal(parsed.sha256, expected)
    assert.deepEqual(parsed.snapshot, snapshot())
  })

  test('sauvegarde invalide refusée avant envoi', async () => {
    const invalid = snapshot()
    delete invalid.tables.orders

    await assert.rejects(
      prepareBackupEnvelope(invalid),
      /tables incohérente/,
    )
  })

  test('nouvelle sauvegarde confirmée', async () => {
    const envelope = await prepareBackupEnvelope(
      snapshot(),
    )

    let calls = 0

    const receipt = await uploadBackup(
      envelope,
      async (url, options) => {
        calls++

        assert.equal(
          url,
          '/restaurant/api/backups/snapshots',
        )

        assert.equal(options.method, 'POST')
        assert.equal(
          options.credentials,
          'same-origin',
        )

        assert.deepEqual(
          JSON.parse(options.body),
          JSON.parse(envelope.body),
        )

        return {
          status: 201,
          async json() {
            return {
              id: '12345678-1234-8234-8234-123456789abc',
              sha256: envelope.sha256,
              stored: true,
              duplicate: false,
            }
          },
        }
      },
    )

    assert.equal(calls, 1)
    assert.equal(receipt.stored, true)
    assert.equal(receipt.duplicate, false)
  })

  test('doublon confirmé accepté', async () => {
    const envelope = await prepareBackupEnvelope(
      snapshot(),
    )

    const receipt = await uploadBackup(
      envelope,
      async () => ({
        status: 200,
        async json() {
          return {
            id: '12345678-1234-8234-8234-123456789abc',
            sha256: envelope.sha256,
            stored: true,
            duplicate: true,
          }
        },
      }),
    )

    assert.equal(receipt.duplicate, true)
  })

  test('session expirée refusée', async () => {
    const envelope = await prepareBackupEnvelope(
      snapshot(),
    )

    await assert.rejects(
      uploadBackup(
        envelope,
        async () => ({ status: 401 }),
      ),
      /Session expirée/,
    )
  })

  test('réponse du serveur avec mauvaise empreinte refusée', async () => {
    const envelope = await prepareBackupEnvelope(
      snapshot(),
    )

    await assert.rejects(
      uploadBackup(
        envelope,
        async () => ({
          status: 201,
          async json() {
            return {
              id: '12345678-1234-8234-8234-123456789abc',
              sha256: '0'.repeat(64),
              stored: true,
              duplicate: false,
            }
          },
        }),
      ),
      /incohérente/,
    )
  })

  test('erreur réseau propagée sans modification locale', async () => {
    const envelope = await prepareBackupEnvelope(
      snapshot(),
    )

    await assert.rejects(
      uploadBackup(
        envelope,
        async () => {
          throw new TypeError('Failed to fetch')
        },
      ),
      /Failed to fetch/,
    )
  })

test('signal AbortController transmis au réseau', async () => {
  const envelope = await prepareBackupEnvelope(snapshot())
  const controller = new AbortController()

  let receivedSignal

  const receipt = await uploadBackup(
    envelope,
    async (_url, options) => {
      receivedSignal = options.signal

      return {
        status: 201,
        async json() {
          return {
            id: '12345678-1234-8234-8234-123456789abc',
            sha256: envelope.sha256,
            stored: true,
            duplicate: false,
          }
        },
      }
    },
    controller.signal,
  )

  assert.equal(receivedSignal, controller.signal)
  assert.equal(receipt.stored, true)
})

test('annulation pendant une requête HTTP', async () => {
  const envelope = await prepareBackupEnvelope(snapshot())
  const controller = new AbortController()

  let started

  const requestStarted = new Promise(resolve => {
    started = resolve
  })

  const transmission = uploadBackup(
    envelope,
    async (_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options.signal.aborted) {
          reject(
            new DOMException(
              'Requête annulée',
              'AbortError',
            ),
          )
          return
        }

        options.signal.addEventListener(
          'abort',
          () => reject(
            new DOMException(
              'Requête annulée',
              'AbortError',
            ),
          ),
          { once: true },
        )

        started()
      })
    },
    controller.signal,
  )

  await requestStarted

  controller.abort()

  await assert.rejects(
    transmission,
    error => error.name === 'AbortError',
  )
})

test('signal déjà annulé refuse la transmission', async () => {
  const envelope = await prepareBackupEnvelope(snapshot())
  const controller = new AbortController()

  controller.abort()

  await assert.rejects(
    uploadBackup(
      envelope,
      async (_url, options) => {
        assert.equal(options.signal.aborted, true)

        throw new DOMException(
          'Requête annulée',
          'AbortError',
        )
      },
      controller.signal,
    ),
    error => error.name === 'AbortError',
  )
})
