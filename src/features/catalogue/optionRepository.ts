import { db } from '../../shared/database/db'

function cleanName(value: string) {
  const name = value.trim().replace(/\s+/g, ' ')

  if (!name || name.length > 80) {
    throw new Error('Nom requis : 1 à 80 caractères.')
  }

  return name
}

function parsePrice(value: string): number | undefined {
  const raw = value.trim()

  if (!raw) return undefined

  const normalized = raw.replace(',', '.')

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Prix invalide. Exemple : 0,50')
  }

  const [euros, cents = ''] = normalized.split('.')
  const result = Number(euros) * 100 + Number(cents.padEnd(2, '0'))

  if (!Number.isSafeInteger(result) || result > 100000000) {
    throw new Error('Prix trop élevé.')
  }

  return result
}

export async function createOptionGroup(name: string) {
  const normalized = cleanName(name)

  await db.transaction('rw', db.optionGroups, async () => {
    const groups = await db.optionGroups.toArray()

    if (groups.some(
      group => group.name.toLocaleLowerCase('fr') ===
        normalized.toLocaleLowerCase('fr'),
    )) {
      throw new Error('Ce groupe existe déjà.')
    }

    await db.optionGroups.add({
      id: crypto.randomUUID(),
      name: normalized,
      position: groups.length
        ? Math.max(...groups.map(g => g.position)) + 1
        : 0,
    })
  })
}

export async function renameOptionGroup(id: string, name: string) {
  const normalized = cleanName(name)

  await db.transaction('rw', db.optionGroups, async () => {
    const groups = await db.optionGroups.toArray()

    if (!groups.some(g => g.id === id)) {
      throw new Error('Groupe introuvable.')
    }

    if (groups.some(
      g => g.id !== id &&
        g.name.toLocaleLowerCase('fr') ===
          normalized.toLocaleLowerCase('fr'),
    )) {
      throw new Error('Ce groupe existe déjà.')
    }

    await db.optionGroups.update(id, { name: normalized })
  })
}

export async function createOption(
  groupId: string,
  name: string,
  price: string,
) {
  const normalized = cleanName(name)
  const priceCents = parsePrice(price)

  await db.transaction('rw', db.optionGroups, db.options, async () => {
    if (!(await db.optionGroups.get(groupId))) {
      throw new Error('Groupe introuvable.')
    }

    const options = await db.options
      .where('groupId')
      .equals(groupId)
      .toArray()

    if (options.some(
      option => option.name.toLocaleLowerCase('fr') ===
        normalized.toLocaleLowerCase('fr'),
    )) {
      throw new Error('Cette option existe déjà.')
    }

    await db.options.add({
      id: crypto.randomUUID(),
      groupId,
      name: normalized,
      priceCents,
      active: true,
      position: options.length
        ? Math.max(...options.map(o => o.position)) + 1
        : 0,
    })
  })
}

export async function updateOption(
  id: string,
  name: string,
  price: string,
) {
  const normalized = cleanName(name)
  const priceCents = parsePrice(price)

  await db.transaction('rw', db.options, async () => {
    const current = await db.options.get(id)

    if (!current) {
      throw new Error('Option introuvable.')
    }

    const options = await db.options
      .where('groupId')
      .equals(current.groupId)
      .toArray()

    if (options.some(
      o => o.id !== id &&
        o.name.toLocaleLowerCase('fr') ===
          normalized.toLocaleLowerCase('fr'),
    )) {
      throw new Error('Cette option existe déjà.')
    }

    await db.options.update(id, {
      name: normalized,
      priceCents,
    })
  })
}

export async function deleteOption(id: string) {
  await db.options.delete(id)
}

export async function setProductOptionGroup(
  productId: string,
  groupId: string,
  enabled: boolean,
) {
  await db.transaction(
    'rw',
    db.products,
    db.optionGroups,
    db.productOptionGroups,
    async () => {
      if (!(await db.products.get(productId))) {
        throw new Error('Produit introuvable.')
      }

      if (!(await db.optionGroups.get(groupId))) {
        throw new Error('Groupe introuvable.')
      }

      const existing = await db.productOptionGroups
        .where('[productId+groupId]')
        .equals([productId, groupId])
        .toArray()

      if (enabled && existing.length === 0) {
        await db.productOptionGroups.add({
          id: crypto.randomUUID(),
          productId,
          groupId,
        })
      }

      if (!enabled && existing.length > 0) {
        await db.productOptionGroups.bulkDelete(
          existing.map(link => link.id),
        )
      }
    },
  )
}
