import {
  SNAPSHOT_VERSION,
  validateSnapshot,
  type RestaurantSnapshot,
} from './snapshotFormat'

const BACKUP_READ_URL =
  '/restaurant/api/backups/snapshots/latest'

export interface RestorableBackup {
  id: string
  formatVersion: number
  createdAt: string
  snapshot: RestaurantSnapshot
}

/**
 * Récupère la sauvegarde serveur sans effectuer
 * aucune écriture dans IndexedDB.
 *
 * La restauration sera une opération distincte,
 * précédée d'une confirmation de l'administrateur.
 */
export async function downloadLatestBackup(
  send: typeof fetch = fetch,
): Promise<RestorableBackup | null> {
  const response = await send(BACKUP_READ_URL, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  })

  if (response.status === 401) {
    throw new Error(
      'Connexion administrateur requise.',
    )
  }

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(
      `Lecture de sauvegarde impossible (HTTP ${response.status}).`,
    )
  }

  const data: unknown = await response.json()

  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new Error('Réponse de sauvegarde invalide.')
  }

  const backup = data as Partial<RestorableBackup>

  if (
    typeof backup.id !== 'string' ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
      .test(backup.id) ||
    backup.formatVersion !== SNAPSHOT_VERSION ||
    typeof backup.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(backup.createdAt))
  ) {
    throw new Error('Métadonnées de sauvegarde invalides.')
  }

  validateSnapshot(backup.snapshot)

  return {
    id: backup.id,
    formatVersion: backup.formatVersion,
    createdAt: backup.createdAt,
    snapshot: backup.snapshot,
  }
}
