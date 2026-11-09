import { db } from '../../shared/database/db'

import {
  SNAPSHOT_TABLES,
  validateSnapshot,
  type RestaurantSnapshot,
  type SnapshotTableName,
} from './snapshotFormat'

import {
  getPendingBackup,
} from './backupOutbox'

import {
  runWithBackupLock,
} from './backupSingleFlight'

/**
 * Confirmation explicite exigée par l'interface.
 *
 * Cette chaîne n'est pas une autorisation serveur :
 * l'authentification sera vérifiée séparément
 * lors du téléchargement de la sauvegarde.
 */
export const RESTORE_CONFIRMATION =
  'RESTAURER SUR CET APPAREIL'

export type RestoreResult =
  | {
      status: 'restored'
      rowCount: number
    }
  | {
      status: 'busy'
    }
  | {
      status: 'unsupported'
    }

/**
 * Restauration limitée à une base totalement vide.
 *
 * Une restauration avec remplacement de données
 * existantes nécessite un parcours distinct,
 * qui ne sera jamais déclenché implicitement.
 *
 * Le verrou partagé empêche une sauvegarde
 * automatique de s'exécuter simultanément
 * dans un autre onglet.
 */
export async function restoreToEmptyDatabase(
  snapshot: RestaurantSnapshot,
  confirmation: string,
): Promise<RestoreResult> {
  if (confirmation !== RESTORE_CONFIRMATION) {
    throw new Error(
      'Confirmation explicite de restauration requise.',
    )
  }

  // Validation complète avant toute écriture.
  validateSnapshot(snapshot)

  // Ne pas conserver de références modifiables
  // vers les objets fournis par le réseau.
  const safeSnapshot = structuredClone(snapshot)

  validateSnapshot(safeSnapshot)

  const result = await runWithBackupLock(
    async () => {
      // Une sauvegarde encore en attente représente
      // des données locales potentiellement absentes
      // de PostgreSQL. Ne jamais l'ignorer.
      const pending = await getPendingBackup()

      if (pending !== null) {
        throw new Error(
          'Une sauvegarde locale attend encore son envoi. ' +
          'Restauration refusée.',
        )
      }

      const tables = SNAPSHOT_TABLES.map(
        name => db.table(name),
      )

      let restoredRows = 0

      // Une seule transaction IndexedDB :
      // toutes les écritures ou aucune.
      await db.transaction(
        'rw',
        tables,
        async () => {
          // Vérifier TOUTES les tables dans la même
          // transaction qui effectuera les insertions.
          // Deux onglets ne peuvent ainsi pas produire
          // un écrasement silencieux entre vérification
          // et insertion.
          const counts = await Promise.all(
            SNAPSHOT_TABLES.map(
              name => db.table(name).count(),
            ),
          )

          const existingRows = counts.reduce(
            (sum, count) => sum + count,
            0,
          )

          if (existingRows !== 0) {
            throw new Error(
              'Cet appareil contient déjà des données. ' +
              'La restauration automatique est refusée.',
            )
          }

          for (const name of SNAPSHOT_TABLES) {
            const rows =
              safeSnapshot.tables[
                name as SnapshotTableName
              ]

            if (rows.length === 0) {
              continue
            }

            // bulkAdd ne remplace aucune clé.
            // Une collision déclenche un échec
            // et l'annulation de la transaction.
            await db.table(name).bulkAdd(rows)

            restoredRows += rows.length
          }
        },
      )

      return restoredRows
    },
  )

  if (result.status === 'busy') {
    return { status: 'busy' }
  }

  if (result.status === 'unsupported') {
    return { status: 'unsupported' }
  }

  return {
    status: 'restored',
    rowCount: result.value,
  }
}
