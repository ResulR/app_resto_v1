import { useRef, useState } from 'react'

import { getAdminSession } from '../auth/authClient'
import { hasPendingLogout } from '../auth/logoutFlow'
import {
  downloadLatestBackup,
  type RestorableBackup,
} from './backupDownload'
import {
  RESTORE_CONFIRMATION,
  restoreToEmptyDatabase,
} from './backupRestore'
import { SNAPSHOT_TABLES } from './snapshotFormat'

type Phase = 'idle' | 'loading' | 'restoring'

export function BackupRestorePanel() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [backup, setBackup] =
    useState<RestorableBackup | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const inProgress = useRef(false)

  const busy = phase !== 'idle'

  async function checkAuthorization() {
    if (!navigator.onLine) {
      throw new Error(
        'Une connexion Internet est nécessaire.'
      )
    }

    if (hasPendingLogout(window.localStorage)) {
      throw new Error(
        'Déconnexion en attente : opération interdite.'
      )
    }

    if (!(await getAdminSession())) {
      throw new Error(
        'Connexion administrateur requise.'
      )
    }

    if (hasPendingLogout(window.localStorage)) {
      throw new Error(
        'La session a été verrouillée.'
      )
    }
  }

  async function inspect() {
    if (inProgress.current) return

    inProgress.current = true
    setPhase('loading')
    setBackup(null)
    setConfirmation('')
    setError('')
    setMessage('')

    try {
      await checkAuthorization()

      const latest = await downloadLatestBackup()

      if (!latest) {
        setMessage(
          'Aucune sauvegarde disponible sur le serveur.'
        )
        return
      }

      await checkAuthorization()
      setBackup(latest)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Consultation impossible.'
      )
    } finally {
      setPhase('idle')
      inProgress.current = false
    }
  }

  async function restore() {
    if (inProgress.current || !backup) return

    if (confirmation !== RESTORE_CONFIRMATION) {
      setError('Confirmation incorrecte.')
      return
    }

    inProgress.current = true
    setPhase('restoring')
    setError('')
    setMessage('')

    try {
      await checkAuthorization()

      const result = await restoreToEmptyDatabase(
        backup.snapshot,
        confirmation,
      )

      if (result.status !== 'restored') {
        throw new Error(
          result.status === 'busy'
            ? 'Une opération de sauvegarde est en cours.'
            : 'Verrouillage du navigateur indisponible.'
        )
      }

      // Recharger les vues et leurs requêtes Dexie
      // après la transaction confirmée.
      window.location.reload()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Restauration impossible.'
      )
    } finally {
      inProgress.current = false
      setPhase('idle')
    }
  }

  const counts = backup
    ? SNAPSHOT_TABLES.map(name => ({
        name,
        count: backup.snapshot.tables[name].length,
      }))
    : []

  const total = counts.reduce(
    (sum, item) => sum + item.count,
    0,
  )

  return (
    <section
      className="admin-account-card"
      aria-label="Restauration des sauvegardes"
    >
      <h2>Restaurer un nouvel appareil</h2>

      <p>
        Récupérer le catalogue, les commandes et les
        paramètres depuis la dernière sauvegarde du serveur.
      </p>

      <p>
        La restauration est autorisée uniquement si les neuf
        tables locales sont vides. Elle ne fusionne ni ne
        remplace les données déjà présentes.
      </p>

      <button
        type="button"
        className="admin-account-button"
        disabled={busy}
        onClick={() => void inspect()}
      >
        {phase === 'loading'
          ? 'Recherche de la sauvegarde...'
          : 'Consulter la dernière sauvegarde'}
      </button>

      {backup && (
        <div>
          <h3>Sauvegarde disponible</h3>

          <p>
            Date serveur :{' '}
            {new Date(backup.createdAt).toLocaleString(
              'fr-BE'
            )}
          </p>

          <p>
            Version : {backup.formatVersion}
          </p>

          <p>
            Enregistrements : {total}
          </p>

          <ul>
            {counts.map(item => (
              <li key={item.name}>
                {item.name} : {item.count}
              </li>
            ))}
          </ul>

          <p className="admin-account-warning">
            Attention : les modifications effectuées depuis
            cette sauvegarde sur l'ancien appareil ne seront
            pas récupérées.
          </p>

          <label htmlFor="restaurant-restore-confirmation">
            Pour confirmer, saisir exactement :
            {' '}{RESTORE_CONFIRMATION}
          </label>

          <input
            id="restaurant-restore-confirmation"
            type="text"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            value={confirmation}
            onChange={event =>
              setConfirmation(event.target.value)
            }
          />

          <button
            type="button"
            className="admin-account-button"
            disabled={
              busy ||
              confirmation !== RESTORE_CONFIRMATION
            }
            onClick={() => void restore()}
          >
            {phase === 'restoring'
              ? 'Restauration en cours...'
              : 'Restaurer sur cet appareil'}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="admin-account-error">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="admin-account-info">
          {message}
        </p>
      )}
    </section>
  )
}
