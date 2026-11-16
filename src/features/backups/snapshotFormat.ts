export const SNAPSHOT_VERSION = 2
export const LEGACY_SNAPSHOT_VERSION = 1

export const LEGACY_SNAPSHOT_TABLES = [
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

export const SNAPSHOT_TABLES = [
  ...LEGACY_SNAPSHOT_TABLES,
  'salesValuations',
  'payments',
  'paymentAllocations',
  'taxConfigurations',
] as const

export type LegacySnapshotTableName = (typeof LEGACY_SNAPSHOT_TABLES)[number]

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
  tables: SnapshotTables | Record<LegacySnapshotTableName, SnapshotRow[]>
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

  if (value.formatVersion !== SNAPSHOT_VERSION && value.formatVersion !== LEGACY_SNAPSHOT_VERSION) {
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
  const expectedTables = value.formatVersion === LEGACY_SNAPSHOT_VERSION
    ? LEGACY_SNAPSHOT_TABLES : SNAPSHOT_TABLES
  const expectedNames = [...expectedTables].sort()

  if (
    JSON.stringify(actualNames) !==
    JSON.stringify(expectedNames)
  ) {
    throw new Error('Liste des tables incohérente.')
  }

  for (const tableName of expectedTables) {
    const rows = (value.tables as Record<string, unknown>)[tableName]

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

  if (value.formatVersion === SNAPSHOT_VERSION) {
    const tabs = value.tables as Record<string, SnapshotRow[]>
    const orderIds = new Set(tabs.orders.map(row => row.id))
    const paymentIds = new Set(tabs.payments.map(row => row.id))
    const positive = (n: unknown): n is number =>
      typeof n === 'number' && Number.isSafeInteger(n) && n > 0
    for (const row of tabs.salesValuations) {
      if (!orderIds.has(row.orderId) || !['draft', 'locked'].includes(String(row.status)) ||
          !Array.isArray(row.lines) ||
          (row.totalTtcCents !== undefined &&
           (typeof row.totalTtcCents !== 'number' || !Number.isSafeInteger(row.totalTtcCents) || row.totalTtcCents < 0))) {
        throw new Error('Valorisation de vente invalide.')
      }
    }
    for (const row of tabs.payments) {
      if (!positive(row.amountCents) || !['cash', 'card'].includes(String(row.method)) ||
          typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) {
        throw new Error('Paiement invalide.')
      }
    }
    const allocationsByPayment = new Map<string, number>()
    for (const row of tabs.paymentAllocations) {
      if (!paymentIds.has(row.paymentId) || !orderIds.has(row.orderId) || !positive(row.amountCents)) {
        throw new Error('Allocation invalide.')
      }
      allocationsByPayment.set(String(row.paymentId), (allocationsByPayment.get(String(row.paymentId)) ?? 0) + Number(row.amountCents))
    }
    for (const row of tabs.payments) {
      if ((allocationsByPayment.get(String(row.id)) ?? 0) !== row.amountCents) {
        throw new Error('Somme des allocations incohérente.')
      }
    }
    // C8 : une commande ne possède qu'une valorisation.
    // Les sauvegardes historiques sans valorisation restent lisibles.
    const valuationTotals = new Map<string, number | undefined>()

    for (const row of tabs.salesValuations) {
      const orderId = String(row.orderId)

      if (valuationTotals.has(orderId)) {
        throw new Error('Valorisations dupliquées pour une commande.')
      }

      valuationTotals.set(
        orderId,
        row.totalTtcCents === undefined
          ? undefined
          : Number(row.totalTtcCents),
      )
    }

    // Une même commande ne peut pas recevoir plus que son
    // total TTC figé, quelle que soit la répartition des paiements.
    const allocationsByOrder = new Map<string, number>()

    for (const row of tabs.paymentAllocations) {
      const orderId = String(row.orderId)
      const current = allocationsByOrder.get(orderId) ?? 0
      const next = current + Number(row.amountCents)

      if (!Number.isSafeInteger(next)) {
        throw new Error('Total des allocations trop élevé.')
      }

      allocationsByOrder.set(orderId, next)
    }

    for (const [orderId, paid] of allocationsByOrder) {
      const total = valuationTotals.get(orderId)

      if (total !== undefined && paid > total) {
        throw new Error('Commande surpayée dans la sauvegarde.')
      }
    }

    for (const row of tabs.taxConfigurations) {
      if (typeof row.productId !== 'string' || !row.productId ||
          !['sur_place', 'emporter'].includes(String(row.consumptionMode)) ||
          typeof row.rateBasisPoints !== 'number' || !Number.isSafeInteger(row.rateBasisPoints) ||
          row.rateBasisPoints < 0 || row.rateBasisPoints > 10000) {
        throw new Error('Configuration TVA invalide.')
      }
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
