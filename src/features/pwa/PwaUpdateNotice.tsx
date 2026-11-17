import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

type PwaStatus = {
  needsRefresh: boolean
  registrationError: boolean
}

const status: PwaStatus = {
  needsRefresh: false,
  registrationError: false,
}

const listeners = new Set<() => void>()
let registered = false

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

function startRegistration() {
  if (registered) return
  registered = true

  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        status.needsRefresh = true
        notify()
      },
      onRegisterError() {
        status.registrationError = true
        notify()
      },
    })
  } catch {
    status.registrationError = true
    notify()
  }
}

export function PwaUpdateNotice() {
  const [current, setCurrent] = useState<PwaStatus>(
    () => ({ ...status }),
  )

  useEffect(() => {
    const update = () => setCurrent({ ...status })
    listeners.add(update)
    update()
    startRegistration()

    return () => {
      listeners.delete(update)
    }
  }, [])

  if (!current.needsRefresh &&
      !current.registrationError) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 460,
        margin: '0 auto',
        zIndex: 10000,
        padding: 16,
        borderRadius: 12,
        background: '#171717',
        color: '#ffffff',
        boxShadow: '0 6px 24px #0005',
      }}
    >
      {current.needsRefresh && (
        <>
          <strong>Nouvelle version disponible</strong>
          <p>
            Terminez vos commandes et encaissements.
            Fermez ensuite toutes les fenêtres Restaurant,
            puis rouvrez l'application pour permettre
            sa mise à jour.
          </p>
          <p>
            Aucune mise à jour ne sera activée
            volontairement pendant votre travail.
          </p>
        </>
      )}
      {current.registrationError && (
        <p role="alert">
          Vérification des mises à jour indisponible.
          Continuez à travailler normalement.
          Une vérification sera nécessaire ultérieurement.
        </p>
      )}
    </div>
  )
}
