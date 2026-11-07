import { db } from '../../shared/database/db'

export async function setProductAvailability(
  id: string,
  active: boolean,
): Promise<void> {
  await db.transaction('rw', db.products, async () => {
    const product = await db.products.get(id)

    if (!product || product.archived) {
      throw new Error('Produit introuvable ou archivé.')
    }

    await db.products.update(id, { active })
  })
}

export async function setOptionAvailability(
  id: string,
  active: boolean,
): Promise<void> {
  await db.transaction('rw', db.options, async () => {
    const option = await db.options.get(id)

    if (!option) {
      throw new Error('Option introuvable.')
    }

    await db.options.update(id, { active })
  })
}

// Source unique pour les futures sélections d'options.
// Les options désactivées sont exclues, y compris de
// l'action « Toutes les salades ».
export async function getAvailableOptionsForProduct(
  productId: string,
) {
  const product = await db.products.get(productId)

  if (!product || !product.active || product.archived) {
    return []
  }

  const links = await db.productOptionGroups
    .where('productId')
    .equals(productId)
    .toArray()

  const groupIds = new Set(
    links.map((link) => link.groupId),
  )

  if (groupIds.size === 0) {
    return []
  }

  const options = await db.options.toArray()

  return options
    .filter(
      (option) =>
        option.active &&
        groupIds.has(option.groupId),
    )
    .sort(
      (a, b) =>
        a.groupId.localeCompare(b.groupId) ||
        a.position - b.position,
    )
}
