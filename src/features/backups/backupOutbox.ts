import Dexie, { type Table } from 'dexie'

import type {
  BackupEnvelope,
} from './backupUpload'

import {
  validateSnapshot,
} from './snapshotFormat'

const PENDING_ID = 'pending'

interface PendingBackup {
  id: string
  sha256: string
  body: string
  createdAt: string
}

class BackupOutboxDatabase extends Dexie {
  pending!: Table<PendingBackup, string>

  constructor() {
    super('restaurant-backup-outbox')

    this.version(1).stores({
      pending: 'id',
    })
  }
}

const outbox = new BackupOutboxDatabase()

function decode(
  record: PendingBackup,
): BackupEnvelope {
  if (
    record.id !== PENDING_ID ||
    !/^[a-f0-9]{64}$/.test(record.sha256)
  ) {
    throw new Error(
      'Sauvegarde en attente invalide.',
    )
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(record.body)
  } catch {
    throw new Error(
      'Sauvegarde en attente illisible.',
    )
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      'Enveloppe de sauvegarde invalide.',
    )
  }

  const value = parsed as Record<string, unknown>

  if (
    Object.keys(value).sort().join(',') !==
      'sha256,snapshot' ||
    value.sha256 !== record.sha256
  ) {
    throw new Error(
      'Enveloppe de sauvegarde incohérente.',
    )
  }

  validateSnapshot(value.snapshot)

  const expectedBody =
    '{"snapshot":' +
    JSON.stringify(value.snapshot) +
    ',"sha256":"' +
    record.sha256 +
    '"}'

  if (record.body !== expectedBody) {
    throw new Error(
      'Sérialisation de sauvegarde incohérente.',
    )
  }

  return {
    snapshot: value.snapshot,
    sha256: record.sha256,
    body: record.body,
  }
}

/**
 * Récupère l'envoi qui n'a pas encore reçu de
 * confirmation du serveur.
 *
 * Aucune suppression automatique en cas d'erreur.
 */
export async function getPendingBackup():
  Promise<BackupEnvelope | null> {
  const record = await outbox.pending.get(PENDING_ID)

  return record ? decode(record) : null
}

/**
 * Enregistre une sauvegarde avant sa transmission.
 *
 * Une sauvegarde déjà en attente est prioritaire :
 * elle ne doit jamais être écrasée par une nouvelle.
 *
 * La transaction empêche deux appels concurrents
 * de remplacer le même emplacement.
 */
export async function stagePendingBackup(
  envelope: BackupEnvelope,
): Promise<BackupEnvelope> {
  if (
    typeof envelope.body !== 'string' ||
    typeof envelope.sha256 !== 'string'
  ) {
    throw new Error(
      'Enveloppe de sauvegarde manquante.',
    )
  }

  const candidate: PendingBackup = {
    id: PENDING_ID,
    sha256: envelope.sha256,
    body: envelope.body,
    createdAt: new Date().toISOString(),
  }

  // Valider le contenu avant toute écriture.
  decode(candidate)

  const selected = await outbox.transaction(
    'rw',
    outbox.pending,
    async () => {
      const existing = await outbox.pending.get(
        PENDING_ID,
      )

      if (existing) return existing

      await outbox.pending.add(candidate)

      return candidate
    },
  )

  return decode(selected)
}

/**
 * La suppression nécessite une confirmation
 * portant exactement sur la sauvegarde en attente.
 *
 * Un ancien reçu ne peut donc pas effacer une
 * sauvegarde plus récente.
 */
export async function confirmPendingBackup(
  sha256: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(
      'Empreinte de confirmation invalide.',
    )
  }

  return outbox.transaction(
    'rw',
    outbox.pending,
    async () => {
      const existing = await outbox.pending.get(
        PENDING_ID,
      )

      if (!existing) return false

      if (existing.sha256 !== sha256) {
        return false
      }

      // Ne jamais supprimer un enregistrement
      // dont le contenu est devenu invalide.
      decode(existing)

      await outbox.pending.delete(PENDING_ID)

      return true
    },
  )
}
