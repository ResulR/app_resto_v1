import { createHash } from 'node:crypto'

export const BACKUP_FORMAT_VERSION = 2
export const LEGACY_BACKUP_FORMAT_VERSION = 1
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024
export const MAX_ROWS_PER_TABLE = 20000

export const LEGACY_BACKUP_TABLES = [
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

export const BACKUP_TABLES = [
  ...LEGACY_BACKUP_TABLES,
  'salesValuations',
  'payments',
  'paymentAllocations',
  'taxConfigurations',
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

  if (input.formatVersion !== BACKUP_FORMAT_VERSION && input.formatVersion !== LEGACY_BACKUP_FORMAT_VERSION) {
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

  const expectedTables = input.formatVersion === LEGACY_BACKUP_FORMAT_VERSION
    ? LEGACY_BACKUP_TABLES : BACKUP_TABLES

  if (!hasExactKeys(input.tables, expectedTables)) {
    return reject('Liste des tables invalide.')
  }

  for (const table of expectedTables) {
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

  if (input.formatVersion === BACKUP_FORMAT_VERSION) {
    const tables = input.tables as Record<string, Record<string, unknown>[]>
    const orderIds = new Set(tables.orders.map(row => row.id))
    const paymentIds = new Set(tables.payments.map(row => row.id))
    const positive = (n: unknown): n is number =>
      typeof n === 'number' && Number.isSafeInteger(n) && n > 0
    for (const row of tables.salesValuations) {
      if (!orderIds.has(row.orderId) || !['draft','locked'].includes(String(row.status)) ||
          !Array.isArray(row.lines) ||
          (row.totalTtcCents !== undefined &&
           (typeof row.totalTtcCents !== 'number' || !Number.isSafeInteger(row.totalTtcCents) || row.totalTtcCents < 0))) {
        return reject('Valorisation de vente invalide.')
      }
    }
    for (const row of tables.payments) {
      if (!positive(row.amountCents) || !['cash','card'].includes(String(row.method)) ||
          typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) {
        return reject('Paiement invalide.')
      }
    }
    const allocated = new Map<string, number>()
    for (const row of tables.paymentAllocations) {
      if (!paymentIds.has(row.paymentId) || !orderIds.has(row.orderId) || !positive(row.amountCents)) {
        return reject('Allocation invalide.')
      }
      allocated.set(String(row.paymentId), (allocated.get(String(row.paymentId)) ?? 0) + Number(row.amountCents))
    }
    for (const row of tables.payments) {
      if ((allocated.get(String(row.id)) ?? 0) !== row.amountCents) {
        return reject('Somme des allocations incohérente.')
      }
    }
    // C10 : cohérence financière entre commandes,
    // valorisations et allocations de paiements.
    const valuationsByOrder = new Map<
      string,
      Record<string, unknown>
    >()

    for (const row of tables.salesValuations) {
      const orderId = String(row.orderId)

      if (valuationsByOrder.has(orderId)) {
        return reject('Valorisations dupliquées pour une commande.')
      }

      valuationsByOrder.set(orderId, row)
    }

    const paidByOrder = new Map<string, number>()

    for (const row of tables.paymentAllocations) {
      const orderId = String(row.orderId)
      const previous = paidByOrder.get(orderId) ?? 0
      const next = previous + Number(row.amountCents)

      if (!Number.isSafeInteger(next)) {
        return reject('Somme des allocations trop élevée.')
      }

      paidByOrder.set(orderId, next)
    }

    for (const [orderId, paid] of paidByOrder) {
      const valuation = valuationsByOrder.get(orderId)

      if (
        !valuation ||
        valuation.status !== 'locked' ||
        typeof valuation.totalTtcCents !== 'number' ||
        !Number.isSafeInteger(valuation.totalTtcCents) ||
        paid > valuation.totalTtcCents
      ) {
        return reject('Paiement ou solde de vente incohérent.')
      }
    }

    for (const row of tables.taxConfigurations) {
      if (typeof row.productId !== 'string' || !row.productId ||
          !['sur_place','emporter'].includes(String(row.consumptionMode)) ||
          typeof row.rateBasisPoints !== 'number' || !Number.isSafeInteger(row.rateBasisPoints) ||
          row.rateBasisPoints < 0 || row.rateBasisPoints > 10000) {
        return reject('Configuration TVA invalide.')
      }
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
