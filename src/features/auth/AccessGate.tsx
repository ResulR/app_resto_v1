import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import {
  getAdminSession,
  loginAdmin,
  logoutAdmin,
} from './authClient'

import { resolveGuardedAccess } from './accessController'
import {
  authorizeOfflineDevice,
  clearOfflineAuthorization,
  hasOfflineAuthorization,
} from './offlineAccess'

import {
  completePendingLogout,
  hasPendingLogout,
} from './logoutFlow'

export const AUTH_CHANGED_EVENT = 'restaurant-auth-changed'

type GateState =
  | 'checking'
  | 'online'
  | 'offline'
  | 'locked'
  | 'pending'

function dependencies() {
  return {
    storage: window.localStorage,
    clearOfflineAuthorization,
    revokeServerSession: logoutAdmin,
  }
}

export function AccessGate({
  children,
}: {
  children: ReactNode
}) {
  const [state, setState] = useState<GateState>('checking')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const verifyAccess = useCallback(async () => {
    setState('checking')
    setError('')

    try {
      const decision = await resolveGuardedAccess(
        {
          checkServerSession: getAdminSession,
          authorizeOfflineDevice,
          hasOfflineAuthorization,
          clearOfflineAuthorization,
        },
        {
          hasPendingLogout: () =>
            hasPendingLogout(window.localStorage),

          completePendingLogout: () =>
            completePendingLogout(dependencies()),
        },
      )

      if (decision.status === 'online') {
        setState('online')

        if (!decision.offlineReady) {
          setNotice(
            'Connexion active, mais accès hors ligne indisponible.',
          )
        }

        return
      }

      if (decision.status === 'offline') {
        setState('offline')
        return
      }

      setNotice('')

      setState(
        hasPendingLogout(window.localStorage)
          ? 'pending'
          : 'locked',
      )
    } catch {
      // Aucune erreur de stockage ne doit ouvrir la caisse.
      setState('locked')
      setError(
        'Vérification impossible. Réessayez ou reconnectez-vous.',
      )
    }
  }, [])

  useEffect(() => {
    void verifyAccess()

    const onAuthChanged = () => {
      void verifyAccess()
    }

    const onStorageChanged = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === 'restaurant-pwa:pending-server-logout:v1'
      ) {
        void verifyAccess()
      }
    }

    window.addEventListener(
      AUTH_CHANGED_EVENT,
      onAuthChanged,
    )

    window.addEventListener(
      'storage',
      onStorageChanged,
    )

    return () => {
      window.removeEventListener(
        AUTH_CHANGED_EVENT,
        onAuthChanged,
      )

      window.removeEventListener(
        'storage',
        onStorageChanged,
      )
    }
  }, [verifyAccess])

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (busy || !password) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      // Vérifier la révocation différée AVANT la connexion.
      if (hasPendingLogout(window.localStorage)) {
        await completePendingLogout(dependencies())

        if (hasPendingLogout(window.localStorage)) {
          setState('pending')
          setError(
            'Déconnexion précédente encore en attente.',
          )
          return
        }
      }

      await loginAdmin(password)

      if (!(await getAdminSession())) {
        throw new Error(
          'Session non confirmée par le serveur.',
        )
      }

      let offlineReady = false

      try {
        await authorizeOfflineDevice()
        offlineReady = true
      } catch {
        // La connexion serveur reste autorisée.
      }

      setPassword('')
      setState('online')

      if (!offlineReady) {
        setNotice(
          'Connexion réussie, mais accès hors ligne indisponible.',
        )
      }
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

  async function retry() {
    if (busy) return

    setBusy(true)

    try {
      await verifyAccess()
    } finally {
      setBusy(false)
    }
  }

  if (state === 'online' || state === 'offline') {
    return (
      <>
        {state === 'offline' && (
          <div
            role="status"
            className="restaurant-offline-banner"
          >
            Mode hors ligne — commandes enregistrées sur cet appareil
          </div>
        )}

        {notice && (
          <div role="status" className="restaurant-offline-banner">
            {notice}
          </div>
        )}

        {children}
      </>
    )
  }

  return (
    <main className="restaurant-access-screen">
      <section className="restaurant-access-card">
        <div className="brand-icon">R</div>

        <h1>Restaurant</h1>
        <p>Accès administrateur</p>

        {state === 'checking' ? (
          <p role="status">
            Vérification de l'autorisation...
          </p>
        ) : (
          <>
            {state === 'pending' && (
              <p role="alert">
                Déconnexion en attente de confirmation serveur.
                La caisse reste verrouillée.
              </p>
            )}

            {state === 'locked' && (
              <form onSubmit={event => void connect(event)}>
                <label htmlFor="restaurant-access-password">
                  Mot de passe administrateur
                </label>

                <input
                  id="restaurant-access-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={event =>
                    setPassword(event.target.value)
                  }
                />

                <button
                  type="submit"
                  disabled={busy || !password}
                >
                  {busy ? 'Connexion...' : 'Se connecter'}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => void retry()}
              disabled={busy}
            >
              {state === 'pending'
                ? 'Réessayer la révocation'
                : 'Vérifier la session'}
            </button>
          </>
        )}

        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  )
}
