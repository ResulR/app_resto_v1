import type { RestaurantSnapshot } from './snapshotFormat'

const CONFIRMED_KEY =
  'restaurant-pwa:last-confirmed-backup-data:v1'

/**
 * L'horodatage de capture est volontairement exclu :
 * deux instantanés des mêmes données ont la même
 * empreinte, même s'ils sont créés à des dates différentes.
 */
export async function fingerprintBackupData(
  snapshot: RestaurantSnapshot,
): Promise<string> {
  const serialized = JSON.stringify(snapshot.tables)

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serialized),
  )

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Si le stockage du marqueur est inaccessible,
 * ne jamais supposer que les données sont déjà
 * sauvegardées : il vaut mieux réessayer l'envoi.
 */
export function wasBackupDataConfirmed(
  fingerprint: string,
): boolean {
  try {
    return (
      window.localStorage.getItem(CONFIRMED_KEY) ===
      fingerprint
    )
  } catch {
    return false
  }
}

/**
 * Cette fonction est appelée uniquement APRÈS
 * confirmation serveur et suppression conditionnelle
 * de l'élément correspondant dans l'outbox.
 */
export function markBackupDataConfirmed(
  fingerprint: string,
): void {
  try {
    window.localStorage.setItem(
      CONFIRMED_KEY,
      fingerprint,
    )
  } catch {
    // Le prochain contrôle retransmettra éventuellement
    // les mêmes données. Aucune donnée de caisse n'est perdue.
  }
}
