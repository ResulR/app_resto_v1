import { db } from '../../shared/database/db'
import type { Category } from '../../shared/database/models'

function validateName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ')

  if (!normalized || normalized.length > 80) {
    throw new Error('Le nom doit contenir entre 1 et 80 caractères.')
  }

  return normalized
}

export async function listCategories(): Promise<Category[]> {
  return db.categories.orderBy('position').toArray()
}

export async function createCategory(name: string): Promise<void> {
  const normalized = validateName(name)

  await db.transaction('rw', db.categories, async () => {
    const categories = await db.categories.toArray()

    if (
      categories.some(
        (category) =>
          category.name.toLocaleLowerCase('fr') ===
          normalized.toLocaleLowerCase('fr'),
      )
    ) {
      throw new Error('Cette catégorie existe déjà.')
    }

    const position = categories.length
      ? Math.max(...categories.map((category) => category.position)) + 1
      : 0

    await db.categories.add({
      id: crypto.randomUUID(),
      name: normalized,
      position,
      active: true,
    })
  })
}

export async function renameCategory(
  id: string,
  name: string,
): Promise<void> {
  const normalized = validateName(name)

  await db.transaction('rw', db.categories, async () => {
    const categories = await db.categories.toArray()
    const current = categories.find((category) => category.id === id)

    if (!current) {
      throw new Error('Catégorie introuvable.')
    }

    if (
      categories.some(
        (category) =>
          category.id !== id &&
          category.name.toLocaleLowerCase('fr') ===
            normalized.toLocaleLowerCase('fr'),
      )
    ) {
      throw new Error('Cette catégorie existe déjà.')
    }

    await db.categories.update(id, { name: normalized })
  })
}

export async function moveCategory(
  id: string,
  direction: -1 | 1,
): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const categories = await db.categories.orderBy('position').toArray()
    const index = categories.findIndex((category) => category.id === id)
    const targetIndex = index + direction

    if (index < 0 || targetIndex < 0 || targetIndex >= categories.length) {
      return
    }

    const reordered = [...categories]
    ;[reordered[index], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[index],
    ]

    await db.categories.bulkPut(
      reordered.map((category, position) => ({
        ...category,
        position,
      })),
    )
  })
}
