export const BACKUP_CHECK_INTERVAL_MS = 60_000

export interface BackupTriggerDependencies {
  run: () => Promise<unknown>
  events: EventTarget
  visibility: EventTarget & {
    visibilityState: string
  }
  setTimer: (
    callback: () => void,
    milliseconds: number,
  ) => ReturnType<typeof setInterval>
  clearTimer: (
    timer: ReturnType<typeof setInterval>,
  ) => void
}

/**
 * Déclenche uniquement des demandes.
 *
 * Les autorisations, délais et exclusions des
 * envois simultanés appartiennent au coordinateur.
 *
 * Aucun événement n'est installé avant start().
 */
export class BackupTriggers {
  private started = false
  private timer:
    ReturnType<typeof setInterval> | null = null

  private readonly dependencies:
    BackupTriggerDependencies

  constructor(dependencies: BackupTriggerDependencies) {
    this.dependencies = dependencies
  }

  private readonly onOnline = (): void => {
    this.trigger()
  }

  private readonly onVisible = (): void => {
    if (
      this.dependencies.visibility.visibilityState ===
      'visible'
    ) {
      this.trigger()
    }
  }

  private readonly onInterval = (): void => {
    this.trigger()
  }

  private trigger(): void {
    if (!this.started) return

    // Une erreur de run ne doit jamais provoquer une
    // rejection non gérée dans le navigateur.
    try {
      void Promise.resolve(
        this.dependencies.run(),
      ).catch(() => {
        // Le coordinateur conserve l'état d'échec.
      })
    } catch {
      // Le déclencheur ne doit jamais interrompre la caisse.
    }
  }

  start(): void {
    if (this.started) return

    this.started = true

    this.dependencies.events.addEventListener(
      'online',
      this.onOnline,
    )

    this.dependencies.visibility.addEventListener(
      'visibilitychange',
      this.onVisible,
    )

    this.timer = this.dependencies.setTimer(
      this.onInterval,
      BACKUP_CHECK_INTERVAL_MS,
    )

    // Vérification initiale sans attente d'un
    // événement réseau ou de visibilité.
    this.trigger()
  }

  stop(): void {
    if (!this.started) return

    this.started = false

    this.dependencies.events.removeEventListener(
      'online',
      this.onOnline,
    )

    this.dependencies.visibility.removeEventListener(
      'visibilitychange',
      this.onVisible,
    )

    if (this.timer !== null) {
      this.dependencies.clearTimer(this.timer)
      this.timer = null
    }
  }

  get isStarted(): boolean {
    return this.started
  }
}
