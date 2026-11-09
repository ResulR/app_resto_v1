import { useEffect } from 'react'

import {
  createLockedBackupRuntime,
} from './backupLockedRuntime'

import {
  BackupTriggers,
} from './backupTriggers'

import {
  abortActiveBackupUpload,
} from './backupRuntime'

/**
 * Gestionnaire invisible des sauvegardes.
 *
 * Il doit être monté uniquement à l'intérieur
 * d'une caisse dont l'accès est autorisé.
 *
 * Il ne modifie jamais directement les commandes.
 */
export function BackupLifecycle() {
  useEffect(() => {
    const runtime = createLockedBackupRuntime()

    const triggers = new BackupTriggers({
      run: () => runtime.attempt(),

      events: window,

      visibility: document,

      setTimer: (callback, milliseconds) =>
        window.setInterval(callback, milliseconds),

      clearTimer: timer =>
        window.clearInterval(timer),
    })

    triggers.start()

    return () => {
      triggers.stop()

      // Une fermeture ou un verrouillage de la caisse
      // ne doit pas laisser une transmission active.
      abortActiveBackupUpload()
    }
  }, [])

  return null
}
