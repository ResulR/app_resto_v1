import { db } from '../../shared/database/db'

import {
  SNAPSHOT_TABLES,
  SNAPSHOT_VERSION,
  validateSnapshot,
  type RestaurantSnapshot,
  type SnapshotTables,
  type SnapshotRow,
} from './snapshotFormat'

/**
 * Instantané cohérent des neuf tables.
 *
 * Une seule transaction Dexie de lecture garantit
 * que les enregistrements appartiennent à la même
 * vue transactionnelle.
 *
 * Cette fonction ne modifie aucune donnée locale.
 */
export async function createRestaurantSnapshot():
  Promise<RestaurantSnapshot> {
  const snapshot = await db.transaction(
    'r',
    SNAPSHOT_TABLES.map(name => db.table(name)),
    async () => {
      const capturedAt = new Date().toISOString()

      const entries = await Promise.all(
        SNAPSHOT_TABLES.map(async name => {
          const rows = await db.table(name).toArray()

          const sorted = (
            rows as SnapshotRow[]
          ).sort((a, b) => {
            const key = name === 'settings'
              ? 'key'
              : 'id'

            return String(a[key]).localeCompare(
              String(b[key]),
            )
          })

          return [name, sorted] as const
        }),
      )

      return {
        formatVersion: SNAPSHOT_VERSION,
        capturedAt,
        tables: Object.fromEntries(
          entries,
        ) as SnapshotTables,
      }
    },
  )

  validateSnapshot(snapshot)

  // Séparer l'instantané des objets provenant
  // directement de la transaction IndexedDB.
  return structuredClone(snapshot)
}
