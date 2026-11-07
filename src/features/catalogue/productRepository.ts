import { db } from '../../shared/database/db'
import type { Product } from '../../shared/database/models'

export type ProductInput = {
  name: string
  categoryId: string
  price: string
}

function parseProduct(input: ProductInput) {
  const name = input.name.trim().replace(/\s+/g, ' ')

  if (!name || name.length > 120) {
    throw new Error('Le nom doit contenir entre 1 et 120 caractères.')
  }

  if (!input.categoryId) {
    throw new Error('Sélectionnez une catégorie.')
  }

  const rawPrice = input.price.trim()

  let priceCents: number | undefined

  if (rawPrice !== '') {
    const normalized = rawPrice.replace(',', '.')

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      throw new Error('Prix invalide. Exemple : 6,50')
    }

    const [euros, cents = ''] = normalized.split('.')

    const calculated =
      Number(euros) * 100 + Number(cents.padEnd(2, '0'))

    if (!Number.isSafeInteger(calculated) || calculated > 100000000) {
      throw new Error('Prix trop élevé.')
    }

    priceCents = calculated
  }

  return {
    name,
    categoryId: input.categoryId,
    priceCents,
  }
}

export async function createProduct(input: ProductInput): Promise<void> {
  const parsed = parseProduct(input)

  await db.transaction('rw', db.categories, db.products, async () => {
    const category = await db.categories.get(parsed.categoryId)

    if (!category || !category.active) {
      throw new Error('Catégorie introuvable ou inactive.')
    }

    const products = await db.products.toArray()

    const positions = products
      .filter((product) => product.categoryId === parsed.categoryId)
      .map((product) => product.position)

    const position = positions.length ? Math.max(...positions) + 1 : 0

    await db.products.add({
      id: crypto.randomUUID(),
      name: parsed.name,
      categoryId: parsed.categoryId,
      priceCents: parsed.priceCents,
      position,
      active: true,
    })
  })
}

export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<void> {
  const parsed = parseProduct(input)

  await db.transaction('rw', db.categories, db.products, async () => {
    const existing = await db.products.get(id)
    const category = await db.categories.get(parsed.categoryId)

    if (!existing || existing.archived) {
      throw new Error('Produit introuvable ou archivé.')
    }

    if (!category || !category.active) {
      throw new Error('Catégorie introuvable ou inactive.')
    }

    let position = existing.position

    if (existing.categoryId !== parsed.categoryId) {
      const products = await db.products
        .where('categoryId')
        .equals(parsed.categoryId)
        .toArray()

      position = products.length
        ? Math.max(...products.map((product) => product.position)) + 1
        : 0
    }

    await db.products.update(id, {
      name: parsed.name,
      categoryId: parsed.categoryId,
      priceCents: parsed.priceCents,
      position,
    })
  })
}

export async function moveProduct(
  id: string,
  direction: -1 | 1,
): Promise<void> {
  await db.transaction('rw', db.products, async () => {
    const current = await db.products.get(id)

    if (!current || current.archived) {
      throw new Error('Produit introuvable ou archivé.')
    }

    const products = (await db.products
      .where('categoryId')
      .equals(current.categoryId)
      .sortBy('position'))
      .filter(product => !product.archived)

    const index = products.findIndex((product) => product.id === id)
    const targetIndex = index + direction

    if (index < 0 || targetIndex < 0 || targetIndex >= products.length) {
      return
    }

    const target = products[targetIndex]

    await db.products.update(current.id, {
      position: target.position,
    })

    await db.products.update(target.id, {
      position: current.position,
    })

    // Normaliser les positions pour éviter les doublons.
    const reordered = [...products]

    ;[reordered[index], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[index],
    ]

    await db.products.bulkPut(
      reordered.map((product, position) => ({
        ...product,
        position,
      })),
    )
  })
}

export async function archiveProduct(id: string): Promise<void> {
  await db.transaction('rw', db.products, async () => {
    const product = await db.products.get(id)

    if (!product || product.archived) {
      throw new Error('Produit introuvable ou déjà archivé.')
    }

    // Conservation de l'enregistrement : pas de suppression physique.
    // Les futures commandes pourront conserver leurs instantanés.
    await db.products.update(id, {
      archived: true,
      active: false,
    })
  })
}

export async function listProducts(): Promise<Product[]> {
  const products = await db.products.orderBy('position').toArray()

  return products.filter(product => !product.archived)
}
