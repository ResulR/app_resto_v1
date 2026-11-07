/**
 * Autorisation locale de l'appareil.
 *
 * Elle n'est créée qu'après une authentification serveur
 * confirmée par le contrôleur de session.
 *
 * Elle permet de poursuivre le fonctionnement hors ligne.
 * Elle ne constitue pas une authentification serveur.
 */

const DATABASE_NAME = 'restaurant-offline-auth'
const STORE_NAME = 'credentials'
const RECORD_ID = 'trusted-device'
const DATABASE_VERSION = 1

const TRUST_DURATION_MS = 30 * 24 * 60 * 60 * 1000

const PROOF = 'restaurant-device-authorized-v1'

interface StoredAuthorization {
  id: string
  key: CryptoKey
  iv: Uint8Array<ArrayBuffer>
  ciphertext: ArrayBuffer
  verifiedAt: number
  expiresAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      DATABASE_NAME,
      DATABASE_VERSION,
    )

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
        })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      reject(new Error('Stockage local indisponible.'))
    }
  })
}

async function getAuthorization():
  Promise<StoredAuthorization | undefined> {
  const database = await openDatabase()

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(
        STORE_NAME,
        'readonly',
      )

      const request = transaction
        .objectStore(STORE_NAME)
        .get(RECORD_ID)

      request.onsuccess = () => {
        resolve(
          request.result as
            | StoredAuthorization
            | undefined,
        )
      }

      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

/**
 * N'appeler cette fonction qu'après confirmation
 * de GET /auth/me avec authenticated: true.
 */
export async function authorizeOfflineDevice():
  Promise<void> {
  const key = await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  )

  const iv = crypto.getRandomValues(
    new Uint8Array(12),
  )

  const plaintext = new TextEncoder().encode(PROOF)

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plaintext,
  )

  const verifiedAt = Date.now()

  const authorization: StoredAuthorization = {
    id: RECORD_ID,
    key,
    iv,
    ciphertext,
    verifiedAt,
    expiresAt: verifiedAt + TRUST_DURATION_MS,
  }

  const database = await openDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        STORE_NAME,
        'readwrite',
      )

      transaction.objectStore(STORE_NAME).put(
        authorization,
      )

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

/**
 * Vérifie que cet appareil dispose d'une
 * autorisation locale cryptographiquement cohérente.
 */
export async function hasOfflineAuthorization():
  Promise<boolean> {
  try {
    const authorization = await getAuthorization()

    if (!authorization) return false

    const now = Date.now()

    if (
      !Number.isFinite(authorization.verifiedAt) ||
      !Number.isFinite(authorization.expiresAt) ||
      authorization.verifiedAt > now ||
      authorization.expiresAt <= now ||
      authorization.expiresAt - authorization.verifiedAt >
        TRUST_DURATION_MS
    ) {
      return false
    }

    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: authorization.iv,
      },
      authorization.key,
      authorization.ciphertext,
    )

    const proof = new TextDecoder().decode(plaintext)

    return proof === PROOF
  } catch {
    return false
  }
}

/**
 * À appeler lors d'une déconnexion explicite
 * ou lorsqu'une session serveur est révoquée.
 */
export async function clearOfflineAuthorization():
  Promise<void> {
  const database = await openDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        STORE_NAME,
        'readwrite',
      )

      transaction.objectStore(STORE_NAME).delete(RECORD_ID)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}
