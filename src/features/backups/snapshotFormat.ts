export const SNAPSHOT_VERSION = 1

export const SNAPSHOT_TABLES = [
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

export type SnapshotTableName =
  (typeof SNAPSHOT_TABLES)[number]

export type SnapshotRow = Record<string, unknown>

export type SnapshotTables = Record<
  SnapshotTableName,
  SnapshotRow[]
>

export interface RestaurantSnapshot {
  formatVersion: number
  capturedAt: string
  tables: SnapshotTables
}

// Limite initiale de validation locale.
// Le serveur devra appliquer sa propre limite.
export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

export function validateSnapshot(
  value: unknown,
): asserts value is RestaurantSnapshot {
  if (!isObject(value)) {
    throw new Error('Sauvegarde invalide.')
  }

  if (value.formatVersion !== SNAPSHOT_VERSION) {
    throw new Error('Version de sauvegarde incompatible.')
  }

  if (
    typeof value.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.capturedAt))
  ) {
    throw new Error('Date de sauvegarde invalide.')
  }

  if (!isObject(value.tables)) {
    throw new Error('Tables de sauvegarde absentes.')
  }

  const actualNames = Object.keys(value.tables).sort()
  const expectedNames = [...SNAPSHOT_TABLES].sort()

  if (
    JSON.stringify(actualNames) !==
    JSON.stringify(expectedNames)
  ) {
    throw new Error('Liste des tables incohérente.')
  }

  for (const tableName of SNAPSHOT_TABLES) {
    const rows = value.tables[tableName]

    if (!Array.isArray(rows)) {
      throw new Error(
        `Table ${tableName} invalide.`,
      )
    }

    const identifiers = new Set<string>()

    for (const row of rows) {
      if (!isObject(row)) {
        throw new Error(
          `Enregistrement invalide : ${tableName}.`,
        )
      }

      const identifier =
        tableName === 'settings'
          ? row.key
          : row.id

      if (
        typeof identifier !== 'string' ||
        identifier.length === 0
      ) {
        throw new Error(
          `Identifiant invalide : ${tableName}.`,
        )
      }

      if (identifiers.has(identifier)) {
        throw new Error(
          `Identifiant dupliqué : ${tableName}.`,
        )
      }

      identifiers.add(identifier)
    }
  }

  let serialized: string | undefined

  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new Error('Sauvegarde non sérialisable.')
  }

  if (typeof serialized !== 'string') {
    throw new Error('Sauvegarde non sérialisable.')
  }

  const bytes = new TextEncoder().encode(
    serialized,
  ).byteLength

  if (bytes > MAX_SNAPSHOT_BYTES) {
    throw new Error(
      'Sauvegarde trop volumineuse pour ce format.',
    )
  }
}
