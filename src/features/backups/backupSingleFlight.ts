export const BACKUP_LOCK_NAME =
  'restaurant-pwa:backup-upload:v1'

export type BackupLockResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'busy' }
  | { status: 'unsupported' }

/**
 * Verrou exclusif partagé entre les onglets
 * de la même origine.
 *
 * ifAvailable évite toute file d'attente :
 * un deuxième onglet abandonne immédiatement.
 *
 * Si Web Locks n'est pas disponible, aucun
 * envoi ne doit être tenté automatiquement.
 */
export async function runWithBackupLock<T>(
  operation: () => Promise<T>,
  manager: Pick<LockManager, 'request'> | null =
    typeof navigator === 'undefined'
      ? null
      : navigator.locks,
): Promise<BackupLockResult<T>> {
  if (
    !manager ||
    typeof manager.request !== 'function'
  ) {
    return { status: 'unsupported' }
  }

  return manager.request(
    BACKUP_LOCK_NAME,
    {
      mode: 'exclusive',
      ifAvailable: true,
    },
    async lock => {
      if (!lock) {
        return { status: 'busy' }
      }

      const value = await operation()

      return {
        status: 'completed',
        value,
      }
    },
  )
}
