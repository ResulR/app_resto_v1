import assert from 'node:assert/strict'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/features/auth/authClient.ts',
  'utf8',
)

const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const exports = {}

new Function('exports', 'require', output)(
  exports,
  () => {
    throw new Error('Import inattendu')
  },
)

const originalFetch = globalThis.fetch

try {
  let calls = []

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })

    if (url.endsWith('/me')) {
      return {
        status: 200,
        ok: true,
        async json() {
          return { authenticated: true }
        },
      }
    }

    if (url.endsWith('/login')) {
      return {
        status: 200,
        ok: true,
        async json() {
          return { authenticated: true }
        },
      }
    }

    return {
      status: 204,
      ok: true,
    }
  }

  assert.equal(
    await exports.getAdminSession(),
    true,
  )

  await exports.loginAdmin('mot-de-passe-test')
  await exports.logoutAdmin()

  assert.equal(calls.length, 3)

  assert.ok(
    calls.every(call =>
      call.url.startsWith('/restaurant/api/auth/'),
    ),
  )

  assert.ok(
    calls.every(call =>
      call.options.credentials === 'same-origin',
    ),
  )

  assert.equal(calls[1].options.method, 'POST')
  assert.equal(calls[2].options.method, 'POST')

  console.log('OK : routes et cookies HTTP')

  globalThis.fetch = async () => ({
    status: 401,
    ok: false,
  })

  assert.equal(
    await exports.getAdminSession(),
    false,
  )

  await assert.rejects(
    exports.loginAdmin('incorrect'),
    /Mot de passe incorrect/,
  )

  console.log('OK : session anonyme et mauvais mot de passe')

  globalThis.fetch = async () => ({
    status: 429,
    ok: false,
  })

  await assert.rejects(
    exports.loginAdmin('incorrect'),
    /Trop de tentatives/,
  )

  console.log('OK : limitation des tentatives')

  console.log('=== TESTS CLIENT AUTH REUSSIS ===')
} finally {
  globalThis.fetch = originalFetch
}
