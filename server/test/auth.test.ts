import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
} from '../src/auth.js'

test('mot de passe protégé et vérifié', async () => {
  const password = 'MotDePasseDeTest-VraimentLong-123'

  const hash = await hashPassword(password)

  assert.ok(hash.startsWith('scrypt$'))
  assert.ok(!hash.includes(password))

  assert.equal(
    await verifyPassword(password, hash),
    true,
  )

  assert.equal(
    await verifyPassword('incorrect', hash),
    false,
  )

  assert.equal(
    await verifyPassword(password, 'invalide'),
    false,
  )

  await assert.rejects(hashPassword('court'))
})

test('tokens de session imprévisibles et hachés', () => {
  const first = generateSessionToken()
  const second = generateSessionToken()

  assert.match(first, /^[a-f0-9]{64}$/)
  assert.notEqual(first, second)

  const hashed = hashSessionToken(first)

  assert.match(hashed, /^[a-f0-9]{64}$/)
  assert.notEqual(hashed, first)
  assert.equal(hashSessionToken(first), hashed)
})
