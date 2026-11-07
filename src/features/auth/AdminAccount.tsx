import { useEffect, useState } from 'react'

import {
  getAdminSession,
  loginAdmin,
  logoutAdmin,
} from './authClient'

type SessionState =
  | 'loading'
  | 'authenticated'
  | 'anonymous'
  | 'unavailable'

export function AdminAccount() {
  const [state, setState] = useState<SessionState>('loading')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    getAdminSession()
      .then(authenticated => {
        if (!cancelled) {
          setState(
            authenticated ? 'authenticated' : 'anonymous',
          )
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

      setPassword('')
      setState('authenticated')
      setMessage('Connexion administrateur réussie.')
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
      await logoutAdmin()
      setState('anonymous')
      setPassword('')
      setMessage('Déconnexion effectuée.')
    } catch (cause) {
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
        Cette étape vérifie la connexion au serveur.
        Le verrouillage de l'application et l'accès hors ligne
        seront intégrés au point 7.4.
      </p>
    </section>
  )
}
