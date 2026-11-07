import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'

test('API locale et routes sensibles fermées', async () => {
  const app = createApp()
  const server = app.listen(0, '127.0.0.1')

  try {
    await new Promise<void>((resolve, reject) => {
      if (server.listening) return resolve()
      server.once('listening', resolve)
      server.once('error', reject)
    })

    const address = server.address()

    assert.ok(address && typeof address !== 'string')

    const base = `http://127.0.0.1:${address.port}`

    const health = await fetch(`${base}/health`)
    assert.equal(health.status, 200)

    assert.deepEqual(await health.json(), {
      service: 'restaurant-api',
      status: 'ok',
    })

    const auth = await fetch(`${base}/auth/login`, {
      method: 'POST',
    })
    assert.equal(auth.status, 501)

    const backup = await fetch(`${base}/backups/export`, {
      method: 'POST',
    })
    assert.equal(backup.status, 501)

    const missing = await fetch(`${base}/unknown`)
    assert.equal(missing.status, 404)

    console.log('OK : santé, isolation et routes fermées')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  }
})
