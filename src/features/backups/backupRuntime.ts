import { BackupCoordinator } from './backupCoordinator'
import {
  getPendingBackup,
  stagePendingBackup,
  confirmPendingBackup,
} from './backupOutbox'
import {
  prepareBackupEnvelope,
  uploadBackup,
  type BackupEnvelope,
} from './backupUpload'
import { createRestaurantSnapshot } from './snapshotRepository'
import { getAdminSession } from '../auth/authClient'
import { hasPendingLogout } from '../auth/logoutFlow'

/**
 * Vérification en ligne obligatoire.
 *
 * L'autorisation hors ligne permet d'utiliser
 * la caisse, mais jamais de transmettre des
 * sauvegardes sans session serveur valide.
 */
export async function canUploadBackup(): Promise<boolean> {
  if (hasPendingLogout(window.localStorage)) {
    return false
  }

  const authenticated = await getAdminSession()

  // Une déconnexion peut survenir pendant
  // la requête de vérification.
  return authenticated && !hasPendingLogout(window.localStorage)
}

/**
 * Récupère d'abord l'instantané persistant.
 *
 * Si aucun instantané n'attend, on crée une
 * nouvelle sauvegarde cohérente de la caisse.
 *
 * L'enregistrement dans l'outbox précède
 * obligatoirement toute transmission réseau.
 */
async function capturePendingBackup():
  Promise<BackupEnvelope> {
  const pending = await getPendingBackup()

  if (pending) return pending

  const snapshot = await createRestaurantSnapshot()
  const prepared = await prepareBackupEnvelope(snapshot)

  return stagePendingBackup(prepared)
}

/**
 * Une confirmation serveur est nécessaire
 * pour supprimer l'instantané de l'outbox.
 */
async function deliverPendingBackup(
  envelope: BackupEnvelope,
): Promise<void> {
  // Dernière vérification juste avant l'envoi.
  if (!(await canUploadBackup())) {
    throw new Error(
      'Transmission interdite : session non autorisée.',
    )
  }

  const receipt = await uploadBackup(envelope)

  if (receipt.sha256 !== envelope.sha256) {
    throw new Error(
      'Confirmation serveur incohérente.',
    )
  }

  const confirmed = await confirmPendingBackup(
    receipt.sha256,
  )

  if (!confirmed) {
    throw new Error(
      'Confirmation locale impossible.',
    )
  }
}

/**
 * Une seule instance doit être créée pour la PWA.
 *
 * Son démarrage et son arrêt seront reliés au
 * cycle de vie React dans une étape ultérieure.
 */
export function createBackupRuntime() {
  return new BackupCoordinator<BackupEnvelope>({
    isOnline: () => navigator.onLine,

    isAuthorized: canUploadBackup,

    capture: capturePendingBackup,

    send: deliverPendingBackup,

    now: () => Date.now(),
  })
}
