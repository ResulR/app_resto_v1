import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'

test('une origine étrangère est refusée', async () => {
  const previous = process.env.RESTAURANT_ALLOWED_ORIGIN

  process.env.RESTAURANT_ALLOWED_ORIGIN =
    'https://restaurant.example.test'

  const server = createApp().listen(0, '127.0.0.1')

  try {
    await new Promise<void>((resolve, reject) => {
      if (server.listening) return resolve()
      server.once('listening', resolve)
      server.once('error', reject)
    })

    const address = server.address()
    assert.ok(address && typeof address !== 'string')

    const base = `http://127.0.0.1:${address.port}`

    const foreign = await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: 'https://foreign.example.test',
      },
    })

    assert.equal(foreign.status, 403)

    const missing = await fetch(`${base}/auth/logout`, {
      method: 'POST',
    })

    assert.equal(missing.status, 403)

    const trusted = await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: 'https://restaurant.example.test',
      },
    })

    // Pas de pool configuré : auth indisponible, mais
    // origine acceptée par le garde HTTP.
    assert.equal(trusted.status, 503)

    const health = await fetch(`${base}/health`)
    assert.equal(health.status, 200)

    console.log('OK : origine étrangère refusée')
    console.log('OK : origine manquante refusée')
    console.log('OK : origine autorisée acceptée')
    console.log('OK : route de santé disponible')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })

    if (previous === undefined) {
      delete process.env.RESTAURANT_ALLOWED_ORIGIN
    } else {
      process.env.RESTAURANT_ALLOWED_ORIGIN = previous
    }
  }
})
