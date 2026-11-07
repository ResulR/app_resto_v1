/**
 * Déconnexion compatible avec une utilisation hors ligne.
 *
 * Le marqueur persistant empêche de réutiliser l'autorisation
 * locale tant que la révocation serveur n'a pas été confirmée.
 *
 * Important : toutes les décisions d'accès devront consulter
 * ce marqueur avant d'autoriser l'ouverture de la caisse.
 */

export const PENDING_LOGOUT_KEY =
  'restaurant-pwa:pending-server-logout:v1'

export interface LogoutStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LogoutDependencies {
  storage: LogoutStorage
  clearOfflineAuthorization: () => Promise<void>
  revokeServerSession: () => Promise<void>
}

export type LogoutResult =
  | { status: 'revoked' }
  | { status: 'pending' }

export function hasPendingLogout(
  storage: LogoutStorage,
): boolean {
  // Une valeur inconnue est considérée comme un verrouillage.
  // Seule l'absence complète du marqueur signifie
  // qu'aucune révocation n'est en attente.
  return storage.getItem(PENDING_LOGOUT_KEY) !== null
}

/**
 * La persistance du verrouillage doit réussir avant
 * toute tentative de suppression de l'autorisation locale.
 *
 * Si le stockage échoue, l'appelant ne doit pas annoncer
 * une déconnexion réussie.
 */
export async function beginLogout(
  dependencies: LogoutDependencies,
): Promise<LogoutResult> {
  dependencies.storage.setItem(
    PENDING_LOGOUT_KEY,
    'pending',
  )

  await dependencies.clearOfflineAuthorization()

  try {
    await dependencies.revokeServerSession()
  } catch {
    // Le marqueur reste présent.
    // La révocation sera retentée à la reconnexion.
    return { status: 'pending' }
  }

  dependencies.storage.removeItem(PENDING_LOGOUT_KEY)

  return { status: 'revoked' }
}

/**
 * Appelé au démarrage et au retour du réseau.
 *
 * Ne jamais supprimer le marqueur tant que le serveur
 * n'a pas confirmé la déconnexion.
 */
export async function completePendingLogout(
  dependencies: LogoutDependencies,
): Promise<LogoutResult | null> {
  if (!hasPendingLogout(dependencies.storage)) {
    return null
  }

  // Réaffirmer le verrouillage local avant le réseau.
  await dependencies.clearOfflineAuthorization()

  try {
    await dependencies.revokeServerSession()
  } catch {
    return { status: 'pending' }
  }

  dependencies.storage.removeItem(PENDING_LOGOUT_KEY)

  return { status: 'revoked' }
}
