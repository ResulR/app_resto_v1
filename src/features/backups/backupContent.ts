import {
  SNAPSHOT_TABLES,
  type RestaurantSnapshot,
} from './snapshotFormat'

// Les paramètres seuls ne constituent pas une caisse à restaurer.
// Toutes les autres tables, y compris les écritures V2,
// doivent être prises en compte.
export function hasRestaurantData(
  snapshot: RestaurantSnapshot,
): boolean {
  const tables = snapshot.tables as Record<string, unknown[]>

  return SNAPSHOT_TABLES.some(
    name => name !== 'settings' &&
      Array.isArray(tables[name]) &&
      tables[name].length > 0,
  )
}
