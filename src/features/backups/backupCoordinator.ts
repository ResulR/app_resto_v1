export const BACKUP_SUCCESS_INTERVAL_MS =
  15 * 60 * 1000

export const BACKUP_RETRY_INTERVAL_MS =
  60 * 1000

export type BackupAttemptResult =
  | 'sent'
  | 'unchanged'
  | 'busy'
  | 'offline'
  | 'unauthorized'
  | 'cooldown'
  | 'failed'

export interface BackupDependencies<Snapshot> {
  isOnline: () => boolean
  isAuthorized: () => Promise<boolean>
  capture: () => Promise<Snapshot | null>
  send: (snapshot: Snapshot) => Promise<void>
  now: () => number
}

/**
 * Ne démarre aucune sauvegarde tout seul.
 *
 * Le branchement aux événements navigateur sera
 * effectué après la validation des tests.
 */
export class BackupCoordinator<Snapshot> {
  private running = false
  private nextAttemptAt = 0
  private lastError: unknown = null

  private readonly dependencies:
    BackupDependencies<Snapshot>

  constructor(
    dependencies: BackupDependencies<Snapshot>,
  ) {
    this.dependencies = dependencies
  }

  get isRunning(): boolean {
    return this.running
  }

  get retryAfter(): number {
    return this.nextAttemptAt
  }

  get error(): unknown {
    return this.lastError
  }

  async attempt(): Promise<BackupAttemptResult> {
    if (this.running) {
      return 'busy'
    }

    const {
      isOnline,
      isAuthorized,
      capture,
      send,
      now,
    } = this.dependencies

    if (!isOnline()) {
      return 'offline'
    }

    if (now() < this.nextAttemptAt) {
      return 'cooldown'
    }

    this.running = true

    try {
      if (!(await isAuthorized())) {
        return 'unauthorized'
      }

      if (!isOnline()) {
        return 'offline'
      }

      const snapshot = await capture()

      // Les données sont identiques à la dernière
      // sauvegarde confirmée. Aucun envoi nécessaire.
      if (snapshot === null) {
        this.lastError = null
        this.nextAttemptAt =
          now() + BACKUP_SUCCESS_INTERVAL_MS

        return 'unchanged'
      }

      // Revérifier l'autorisation après la lecture locale.
      // Une déconnexion a pu intervenir entre-temps.
      if (!(await isAuthorized())) {
        return 'unauthorized'
      }

      if (!isOnline()) {
        return 'offline'
      }

      await send(snapshot)

      this.lastError = null
      this.nextAttemptAt =
        now() + BACKUP_SUCCESS_INTERVAL_MS

      return 'sent'
    } catch (error) {
      this.lastError = error
      this.nextAttemptAt =
        now() + BACKUP_RETRY_INTERVAL_MS

      return 'failed'
    } finally {
      this.running = false
    }
  }
}
