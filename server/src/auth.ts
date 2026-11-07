import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export async function hashPassword(
  password: string,
): Promise<string> {
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 1024
  ) {
    throw new Error('Mot de passe invalide.')
  }

  const salt = randomBytes(32)

  const derived = await scrypt(
    password,
    salt,
    64,
  ) as Buffer

  return [
    'scrypt',
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$')
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 1024) {
    return false
  }

  const parts = stored.split('$')

  if (
    parts.length !== 3 ||
    parts[0] !== 'scrypt' ||
    !/^[a-f0-9]{64}$/.test(parts[1]) ||
    !/^[a-f0-9]{128}$/.test(parts[2])
  ) {
    return false
  }

  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')

  const actual = await scrypt(
    password,
    salt,
    expected.length,
  ) as Buffer

  return timingSafeEqual(actual, expected)
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256')
    .update(token)
    .digest('hex')
}
