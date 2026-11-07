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
  } catch (error) {
    // Une réponse HTTP d'erreur, une réponse JSON invalide
    // ou une erreur applicative ne doivent jamais activer
    // une autorisation locale de secours.
    //
    // fetch() rejette normalement avec TypeError lorsque
    // la requête ne peut pas aboutir au niveau réseau.
    if (!(error instanceof TypeError)) {
      return {
        status: 'locked',
        reason: 'offline-unavailable',
      }
    }

    try {
      const locallyAuthorized =
        await dependencies.hasOfflineAuthorization()

      return locallyAuthorized
        ? { status: 'offline' }
        : {
            status: 'locked',
            reason: 'offline-unavailable',
          }
    } catch {
      return {
        status: 'locked',
        reason: 'offline-unavailable',
      }
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


/**
 * Porte d'entrée destinée à l'application.
 *
 * La présence d'une déconnexion en attente interdit l'accès,
 * y compris si le serveur possède encore un cookie valide.
 * La fin de la révocation ne rouvre jamais automatiquement
 * l'application : une nouvelle connexion sera nécessaire.
 */
export async function resolveGuardedAccess(
  access: AccessDependencies,
  logout: {
    hasPendingLogout: () => boolean
    completePendingLogout: () => Promise<unknown>
  },
): Promise<AccessDecision> {
  try {
    if (logout.hasPendingLogout()) {
      try {
        await logout.completePendingLogout()
      } catch {
        // Même si la révocation échoue, rester verrouillé.
      }

      return {
        status: 'locked',
        reason: 'session-invalid',
      }
    }
  } catch {
    // Stockage local inaccessible : refuser l'accès.
    return {
      status: 'locked',
      reason: 'offline-unavailable',
    }
  }

  return resolveAccess(access)
}

/**
 * Empêche une vérification devenue obsolète de créer
 * ou de conserver une autorisation locale.
 *
 * Exemple : une vérification démarre, puis l'administrateur
 * se déconnecte pendant l'écriture IndexedDB.
 */
export async function authorizeForCurrentVerification(
  isCurrent: () => boolean,
  isLogoutPending: () => boolean,
  grant: () => Promise<void>,
  revokeLocal: () => Promise<void>,
): Promise<void> {
  if (!isCurrent() || isLogoutPending()) {
    throw new Error('Vérification devenue obsolète.')
  }

  await grant()

  if (!isCurrent() || isLogoutPending()) {
    await revokeLocal()
    throw new Error('Autorisation locale annulée.')
  }
}
