import {
  createBackupRuntime,
} from './backupRuntime'

import {
  runWithBackupLock,
  type BackupLockResult,
} from './backupSingleFlight'

import type {
  BackupAttemptResult,
} from './backupCoordinator'

export interface BackupAttemptRunner {
  attempt: () => Promise<BackupAttemptResult>
}

export type LockedBackupResult =
  BackupLockResult<BackupAttemptResult>

export type BackupLockExecutor = (
  operation: () => Promise<BackupAttemptResult>,
) => Promise<LockedBackupResult>

/**
 * Le verrou couvre TOUTE la tentative :
 *
 * - contrôle de la session ;
 * - lecture de la file persistante ;
 * - création de l'instantané si nécessaire ;
 * - transmission HTTP ;
 * - confirmation et suppression conditionnelle.
 *
 * Aucun travail de sauvegarde ne commence
 * avant l'obtention du verrou inter-onglets.
 */
export function createLockedBackupRuntime(
  runtime: BackupAttemptRunner = createBackupRuntime(),
  executeWithLock: BackupLockExecutor = runWithBackupLock,
) {
  return {
    attempt(): Promise<LockedBackupResult> {
      return executeWithLock(
        () => runtime.attempt(),
      )
    },
  }
}
