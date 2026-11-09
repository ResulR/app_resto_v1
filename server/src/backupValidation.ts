import { createHash } from 'node:crypto'

export const BACKUP_FORMAT_VERSION = 1
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024
export const MAX_ROWS_PER_TABLE = 20000

export const BACKUP_TABLES = [
  'categories',
  'products',
  'variants',
  'optionGroups',
  'productOptionGroups',
  'options',
  'drafts',
  'orders',
  'settings',
] as const

export interface ValidatedBackup {
  formatVersion: number
  capturedAt: string
  tables: Record<string, Record<string, unknown>[]>
}

export interface BackupValidationResult {
  snapshot: ValidatedBackup
  bytes: number
  sha256: string
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupValidationError'
  }
}

function reject(message: string): never {
  throw new BackupValidationError(message)
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)

  return prototype === Object.prototype ||
    prototype === null
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()

  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

export function validateBackup(
  input: unknown,
): BackupValidationResult {
  if (!isPlainObject(input)) {
    return reject('Sauvegarde invalide.')
  }

  if (
    !hasExactKeys(input, [
      'formatVersion',
      'capturedAt',
      'tables',
    ])
  ) {
    return reject('Structure principale invalide.')
  }

  if (input.formatVersion !== BACKUP_FORMAT_VERSION) {
    return reject('Version de sauvegarde incompatible.')
  }

  if (
    typeof input.capturedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      .test(input.capturedAt) ||
    !Number.isFinite(Date.parse(input.capturedAt))
  ) {
    return reject('Date de sauvegarde invalide.')
  }

  if (
    new Date(input.capturedAt).toISOString() !==
    input.capturedAt
  ) {
    return reject('Date de sauvegarde incohérente.')
  }

  if (!isPlainObject(input.tables)) {
    return reject('Tables de sauvegarde invalides.')
  }

  if (!hasExactKeys(input.tables, BACKUP_TABLES)) {
    return reject('Liste des tables invalide.')
  }

  for (const table of BACKUP_TABLES) {
    const rows = input.tables[table]

    if (!Array.isArray(rows)) {
      return reject(`Table ${table} invalide.`)
    }

    if (rows.length > MAX_ROWS_PER_TABLE) {
      return reject(`Table ${table} trop volumineuse.`)
    }

    const identifiers = new Set<string>()

    for (const row of rows) {
      if (!isPlainObject(row)) {
        return reject(
          `Enregistrement invalide : ${table}.`,
        )
      }

      const identifier = table === 'settings'
        ? row.key
        : row.id

      if (
        typeof identifier !== 'string' ||
        identifier.length === 0 ||
        identifier.length > 256
      ) {
        return reject(
          `Identifiant invalide : ${table}.`,
        )
      }

      if (identifiers.has(identifier)) {
        return reject(
          `Identifiant dupliqué : ${table}.`,
        )
      }

      identifiers.add(identifier)
    }
  }

  // Contrôles minimaux des commandes :
  // les règles métier détaillées seront ajoutées
  // avant l'activation de l'API de sauvegarde.
  const orders = input.tables.orders as
    Record<string, unknown>[]

  for (const order of orders) {
    if (
      order.status !== 'validated' &&
      order.status !== 'completed'
    ) {
      return reject('Statut de commande invalide.')
    }

    if (
      typeof order.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(order.createdAt))
    ) {
      return reject('Date de commande invalide.')
    }

    if (
      !Array.isArray(order.items) ||
      order.items.length === 0
    ) {
      return reject('Articles de commande invalides.')
    }

    if (
      typeof order.knownTotalCents !== 'number' ||
      !Number.isSafeInteger(order.knownTotalCents) ||
      order.knownTotalCents < 0
    ) {
      return reject('Montant de commande invalide.')
    }

    if (typeof order.totalComplete !== 'boolean') {
      return reject('Indicateur de total invalide.')
    }
  }

  let serialized: string

  try {
    serialized = JSON.stringify(input)
  } catch {
    return reject('Sauvegarde non sérialisable.')
  }

  if (typeof serialized !== 'string') {
    return reject('Sauvegarde non sérialisable.')
  }

  const bytes = Buffer.byteLength(serialized, 'utf8')

  if (bytes > MAX_BACKUP_BYTES) {
    return reject('Sauvegarde trop volumineuse.')
  }

  return {
    snapshot: input as unknown as ValidatedBackup,
    bytes,
    sha256: createHash('sha256')
      .update(serialized, 'utf8')
      .digest('hex'),
  }
}
