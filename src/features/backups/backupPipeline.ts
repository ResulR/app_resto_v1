import type {
  BackupEnvelope,
  BackupReceipt,
} from './backupUpload'

import type {
  RestaurantSnapshot,
} from './snapshotFormat'

export interface BackupPipelineDependencies {
  getPending: () => Promise<BackupEnvelope | null>

  capture: () => Promise<RestaurantSnapshot>

  prepare: (
    snapshot: RestaurantSnapshot,
  ) => Promise<BackupEnvelope>

  stage: (
    envelope: BackupEnvelope,
  ) => Promise<BackupEnvelope>

  upload: (
    envelope: BackupEnvelope,
  ) => Promise<BackupReceipt>

  confirm: (
    sha256: string,
  ) => Promise<boolean>
}

/**
 * Exécute une transmission complète.
 *
 * 1. Récupérer une sauvegarde en attente.
 * 2. Sinon capturer et enregistrer localement.
 * 3. Transmettre l'instantané enregistré.
 * 4. Vérifier le reçu.
 * 5. Retirer uniquement l'instantané confirmé.
 *
 * Ce module n'efface jamais les données de la caisse.
 *
 * Les vérifications d'authentification, le verrou
 * anti-concurrence et les délais de nouvelle tentative
 * sont assurés par BackupCoordinator.
 */
export async function processBackup(
  dependencies: BackupPipelineDependencies,
): Promise<BackupReceipt> {
  let pending = await dependencies.getPending()

  if (!pending) {
    const snapshot = await dependencies.capture()

    const prepared = await dependencies.prepare(
      snapshot,
    )

    // Une autre opération peut avoir déjà créé
    // une sauvegarde en attente.
    // stage() renvoie alors cette sauvegarde
    // plutôt que d'écraser son contenu.
    pending = await dependencies.stage(prepared)
  }

  // Aucun retrait de la file avant la confirmation.
  const receipt = await dependencies.upload(pending)

  if (
    receipt.stored !== true ||
    receipt.sha256 !== pending.sha256
  ) {
    throw new Error(
      'Confirmation serveur incohérente.',
    )
  }

  const removed = await dependencies.confirm(
    pending.sha256,
  )

  if (!removed) {
    throw new Error(
      'Confirmation locale de sauvegarde impossible.',
    )
  }

  return receipt
}
