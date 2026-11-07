const API = '/restaurant/api/auth'

export async function getAdminSession(): Promise<boolean> {
  const response = await fetch(`${API}/me`, {
    credentials: 'same-origin',
    cache: 'no-store',
  })

  if (response.status === 401) return false

  if (!response.ok) {
    throw new Error('Impossible de vérifier la session.')
  }

  const result: { authenticated: boolean } =
    await response.json()

  return result.authenticated === true
}

export async function loginAdmin(
  password: string,
): Promise<void> {
  const response = await fetch(`${API}/login`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (response.status === 401) {
    throw new Error('Mot de passe incorrect.')
  }

  if (response.status === 429) {
    throw new Error(
      'Trop de tentatives. Réessayez dans 15 minutes.',
    )
  }

  if (!response.ok) {
    throw new Error(
      'Connexion impossible. Vérifiez le réseau.',
    )
  }

  const result: { authenticated: boolean } =
    await response.json()

  if (result.authenticated !== true) {
    throw new Error('Connexion non confirmée.')
  }
}

export async function logoutAdmin(): Promise<void> {
  const response = await fetch(`${API}/logout`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
  })

  if (response.status !== 204) {
    throw new Error(
      'Déconnexion non confirmée par le serveur.',
    )
  }
}
