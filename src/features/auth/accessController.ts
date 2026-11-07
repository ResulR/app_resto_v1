export type AccessDecision =
  | {
      status: 'online'
      offlineReady: boolean
    }
  | {
      status: 'offline'
    }
  | {
      status: 'locked'
      reason: 'session-invalid' | 'offline-unavailable'
    }

export interface AccessDependencies {
  checkServerSession: () => Promise<boolean>
  authorizeOfflineDevice: () => Promise<void>
  hasOfflineAuthorization: () => Promise<boolean>
  clearOfflineAuthorization: () => Promise<void>
}

/**
 * Une réponse négative du serveur est définitive :
 * elle ne doit jamais déclencher un accès hors ligne.
 *
 * Seule une indisponibilité du serveur peut permettre
 * de réutiliser une autorisation locale existante.
 */
export async function resolveAccess(
  dependencies: AccessDependencies,
): Promise<AccessDecision> {
  let serverAuthenticated: boolean

  try {
    serverAuthenticated =
      await dependencies.checkServerSession()
  } catch {
    const locallyAuthorized =
      await dependencies.hasOfflineAuthorization()

    return locallyAuthorized
      ? { status: 'offline' }
      : {
          status: 'locked',
          reason: 'offline-unavailable',
        }
  }

  if (!serverAuthenticated) {
    await dependencies.clearOfflineAuthorization()

    return {
      status: 'locked',
      reason: 'session-invalid',
    }
  }

  try {
    await dependencies.authorizeOfflineDevice()

    return {
      status: 'online',
      offlineReady: true,
    }
  } catch {
    // Une impossibilité de stocker l'autorisation
    // hors ligne n'invalide pas la session serveur.
    return {
      status: 'online',
      offlineReady: false,
    }
  }
}
