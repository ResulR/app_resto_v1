import { db } from '../../shared/database/db'

export type VariantInput = {
  name: string
  price: string
}

function validateVariant(input: VariantInput) {
  const name = input.name.trim().replace(/\s+/g, ' ')

  if (!name || name.length > 80) {
    throw new Error('Le nom doit contenir entre 1 et 80 caractères.')
  }

  const raw = input.price.trim()
  let priceCents: number | undefined

  if (raw !== '') {
    const normalized = raw.replace(',', '.')

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      throw new Error('Prix invalide. Exemple : 6,50')
    }

    const [euros, cents = ''] = normalized.split('.')
    const value = Number(euros) * 100 + Number(cents.padEnd(2, '0'))

    if (!Number.isSafeInteger(value) || value > 100000000) {
      throw new Error('Prix trop élevé.')
    }

    priceCents = value
  }

  return { name, priceCents }
}

export async function createVariant(
  productId: string,
  input: VariantInput,
) {
  const data = validateVariant(input)

  await db.transaction('rw', db.products, db.variants, async () => {
    const product = await db.products.get(productId)

    if (!product) {
      throw new Error('Produit introuvable.')
    }

    const existing = await db.variants
      .where('productId')
      .equals(productId)
      .toArray()

    if (existing.some(
      v => v.name.toLocaleLowerCase('fr') ===
        data.name.toLocaleLowerCase('fr'),
    )) {
      throw new Error('Cette variante existe déjà.')
    }

    const position = existing.length
      ? Math.max(...existing.map(v => v.position)) + 1
      : 0

    await db.variants.add({
      id: crypto.randomUUID(),
      productId,
      position,
      ...data,
    })
  })
}

export async function updateVariant(
  id: string,
  input: VariantInput,
) {
  const data = validateVariant(input)

  await db.transaction('rw', db.variants, async () => {
    const current = await db.variants.get(id)

    if (!current) {
      throw new Error('Variante introuvable.')
    }

    const existing = await db.variants
      .where('productId')
      .equals(current.productId)
      .toArray()

    if (existing.some(
      v => v.id !== id &&
        v.name.toLocaleLowerCase('fr') ===
          data.name.toLocaleLowerCase('fr'),
    )) {
      throw new Error('Cette variante existe déjà.')
    }

    await db.variants.update(id, data)
  })
}

export async function deleteVariant(id: string) {
  await db.transaction('rw', db.variants, async () => {
    if (!(await db.variants.get(id))) {
      throw new Error('Variante introuvable.')
    }

    await db.variants.delete(id)
  })
}

export async function moveVariant(
  id: string,
  direction: -1 | 1,
) {
  await db.transaction('rw', db.variants, async () => {
    const current = await db.variants.get(id)

    if (!current) {
      throw new Error('Variante introuvable.')
    }

    const variants = await db.variants
      .where('productId')
      .equals(current.productId)
      .sortBy('position')

    const index = variants.findIndex(v => v.id === id)
    const target = index + direction

    if (target < 0 || target >= variants.length) return

    ;[variants[index], variants[target]] = [
      variants[target],
      variants[index],
    ]

    await db.variants.bulkPut(
      variants.map((variant, position) => ({
        ...variant,
        position,
      })),
    )
  })
}
