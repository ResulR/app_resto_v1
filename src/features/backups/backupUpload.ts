import {
  validateSnapshot,
  type RestaurantSnapshot,
} from './snapshotFormat'

const BACKUP_URL = '/restaurant/api/backups/snapshots'

export interface BackupReceipt {
  id: string
  sha256: string
  stored: true
  duplicate: boolean
}

export interface BackupEnvelope {
  snapshot: RestaurantSnapshot
  sha256: string
  body: string
}

/**
 * Le JSON est sérialisé une seule fois.
 *
 * L'empreinte SHA-256 couvre exactement les octets
 * UTF-8 du champ snapshot envoyés au serveur.
 *
 * L'enveloppe JSON est construite depuis cette
 * sérialisation pour éviter toute divergence.
 */
export async function prepareBackupEnvelope(
  snapshot: RestaurantSnapshot,
): Promise<BackupEnvelope> {
  validateSnapshot(snapshot)

  const snapshotJson = JSON.stringify(snapshot)
  const bytes = new TextEncoder().encode(snapshotJson)

  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes,
  )

  const sha256 = Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')

  const body = (
    '{"snapshot":' +
    snapshotJson +
    ',"sha256":"' +
    sha256 +
    '"}'
  )

  return {
    snapshot,
    sha256,
    body,
  }
}

/**
 * Cette fonction n'efface ni ne modifie IndexedDB.
 *
 * Pas de nouvelle tentative automatique ici :
 * l'ordonnanceur hors ligne sera ajouté séparément.
 */
export async function uploadBackup(
  envelope: BackupEnvelope,
  send: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<BackupReceipt> {
  if (
    !/^[a-f0-9]{64}$/.test(envelope.sha256)
  ) {
    throw new Error('Empreinte de sauvegarde invalide.')
  }

  const response = await send(BACKUP_URL, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: envelope.body,
  })

  if (response.status === 401) {
    throw new Error(
      'Session expirée : connexion administrateur requise.',
    )
  }

  if (response.status === 413) {
    throw new Error(
      'Sauvegarde trop volumineuse.',
    )
  }

  if (
    response.status !== 200 &&
    response.status !== 201
  ) {
    throw new Error(
      `Sauvegarde non confirmée (HTTP ${response.status}).`,
    )
  }

  const result: unknown = await response.json()

  if (
    !result ||
    typeof result !== 'object'
  ) {
    throw new Error('Reçu de sauvegarde invalide.')
  }

  const receipt = result as Partial<BackupReceipt>

  if (
    typeof receipt.id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
      .test(receipt.id) ||
    receipt.sha256 !== envelope.sha256 ||
    receipt.stored !== true ||
    typeof receipt.duplicate !== 'boolean' ||
    receipt.duplicate !== (response.status === 200)
  ) {
    throw new Error(
      'Confirmation de sauvegarde incohérente.',
    )
  }

  return receipt as BackupReceipt
}
