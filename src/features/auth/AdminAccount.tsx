import { useEffect, useState } from 'react'

import {
  getAdminSession,
  loginAdmin,
  logoutAdmin,
} from './authClient'
import { resolveGuardedAccess } from './accessController'
import { AUTH_LOCK_EVENT } from './AccessGate'
import {
  beginLogout,
  completePendingLogout,
  hasPendingLogout,
} from './logoutFlow'
import {
  authorizeOfflineDevice,
  hasOfflineAuthorization,
  clearOfflineAuthorization,
} from './offlineAccess'

const accessDependencies = {
  checkServerSession: getAdminSession,
  authorizeOfflineDevice,
  hasOfflineAuthorization,
  clearOfflineAuthorization,
}

function logoutDependencies() {
  return {
    storage: window.localStorage,
    clearOfflineAuthorization,
    revokeServerSession: logoutAdmin,
  }
}

const logoutGuard = {
  hasPendingLogout: () =>
    hasPendingLogout(window.localStorage),
  completePendingLogout: () =>
    completePendingLogout(logoutDependencies()),
}

type SessionState =
  | 'loading'
  | 'authenticated'
  | 'offline'
  | 'anonymous'
  | 'unavailable'
  | 'pending-logout'

export function AdminAccount() {
  const [state, setState] = useState<SessionState>('loading')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    resolveGuardedAccess(
      accessDependencies,
      logoutGuard,
    )
      .then(decision => {
        if (cancelled) return

        if (decision.status === 'online') {
          setState('authenticated')

          if (!decision.offlineReady) {
            setMessage(
              'Connexion active, mais accès hors ligne indisponible.',
            )
          }
        } else if (decision.status === 'offline') {
          setState('offline')
        } else {
          // Même si la révocation vient de réussir,
          // le contrôleur impose une nouvelle connexion.
          try {
            if (hasPendingLogout(window.localStorage)) {
              setState('pending-logout')
            } else {
              setState(
                decision.reason === 'session-invalid'
                  ? 'anonymous'
                  : 'unavailable',
              )
            }
          } catch {
            setState('unavailable')
          }
        }
      })
      .catch(() => {
        if (!cancelled) setState('unavailable')
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (busy || !password) return

    try {
      if (hasPendingLogout(window.localStorage)) {
        setState('pending-logout')
        setError(
          'Une déconnexion doit encore être confirmée.',
        )
        return
      }
    } catch {
      setError('Stockage local inaccessible.')
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    try {
      await loginAdmin(password)

      // Confirmer également que le cookie de session
      // est bien reconnu sur les requêtes suivantes.
      const authenticated = await getAdminSession()

      if (!authenticated) {
        throw new Error(
          'Le serveur ne reconnaît pas la session.',
        )
      }

      // La vérification serveur précède impérativement
      // la création de l'autorisation locale.
      let offlineReady = false

      try {
        await authorizeOfflineDevice()
        offlineReady = true
      } catch {
        // Ne pas invalider une session serveur valide.
      }

      setPassword('')
      setState('authenticated')
      setMessage(
        offlineReady
          ? 'Connexion réussie. Appareil autorisé hors ligne.'
          : 'Connexion réussie. Accès hors ligne indisponible.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Connexion impossible.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (busy) return

    setBusy(true)
    setError('')
    setMessage('')

    try {
      // beginLogout enregistre son marqueur synchrone
      // avant sa première opération asynchrone.
      const operation = beginLogout(
        logoutDependencies(),
      )

      // Verrouiller React sans attendre le réseau
      // ni la suppression IndexedDB.
      setState('pending-logout')
      setPassword('')
      window.dispatchEvent(new Event(AUTH_LOCK_EVENT))

      const result = await operation

      if (result.status === 'pending') {
        setState('pending-logout')
        setMessage(
          'Accès local révoqué. Déconnexion serveur en attente.',
        )
      } else {
        setState('anonymous')
        setMessage('Déconnexion effectuée.')
      }
    } catch (cause) {
      // Si le marqueur a été enregistré avant l'erreur,
      // ne plus présenter la session comme active.
      try {
        if (hasPendingLogout(window.localStorage)) {
          setState('pending-logout')
          window.dispatchEvent(new Event(AUTH_LOCK_EVENT))
        }
      } catch {
        // Ne pas annoncer une déconnexion réussie.
      }

      setError(
        cause instanceof Error
          ? cause.message
          : 'Déconnexion impossible.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-account">
      <div className="section-heading">
        <span className="eyebrow">ADMINISTRATION</span>
        <h1>Compte administrateur</h1>
        <p>
          Connexion sécurisée au serveur du restaurant.
        </p>
      </div>

      {state === 'loading' && (
        <p role="status">Vérification de la session...</p>
      )}

      {state === 'offline' && (
        <div className="admin-account-card">
          <p className="admin-account-warning" role="status">
            Appareil autorisé hors ligne.
          </p>
          <p>
            Le serveur est inaccessible. Les commandes restent
            stockées localement.
          </p>
          <button
            type="button"
            className="admin-account-button"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {busy ? 'Déconnexion...' : 'Se déconnecter'}
          </button>
        </div>
      )}

      {state === 'pending-logout' && (
        <div className="admin-account-card">
          <p className="admin-account-warning" role="alert">
            Déconnexion serveur en attente.
          </p>
          <p>
            L'autorisation locale a été révoquée.
            Une connexion Internet est nécessaire pour
            terminer la déconnexion.
          </p>
          <button
            type="button"
            className="admin-account-button"
            onClick={() => window.location.reload()}
          >
            Réessayer la révocation
          </button>
        </div>
      )}

      {state === 'authenticated' && (
        <div className="admin-account-card">
          <p className="admin-account-success">
            ✓ Administrateur connecté
          </p>

          <button
            type="button"
            className="admin-account-button"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {busy ? 'Déconnexion...' : 'Se déconnecter'}
          </button>
        </div>
      )}

      {(state === 'anonymous' || state === 'unavailable') && (
        <form
          className="admin-account-card"
          onSubmit={event => void connect(event)}
        >
          {state === 'unavailable' && (
            <p className="admin-account-warning">
              Le serveur est actuellement inaccessible.
            </p>
          )}

          <label htmlFor="restaurant-admin-password">
            Mot de passe administrateur
          </label>

          <input
            id="restaurant-admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={event => setPassword(event.target.value)}
          />

          <button
            className="admin-account-button"
            type="submit"
            disabled={busy || password.length === 0}
          >
            {busy ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      )}

      {error && (
        <p className="admin-account-error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="admin-account-success" role="status">
          {message}
        </p>
      )}

      <p className="admin-account-info">
        L'autorisation locale est maintenant préparée et
        vérifiée depuis cet écran. Le verrouillage général
        sera activé après validation des tests navigateur.
      </p>
    </section>
  )
}
