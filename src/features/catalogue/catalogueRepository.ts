import { db } from '../../shared/database/db'

export async function getCatalogue() {
  const [categories, products] = await Promise.all([
    db.categories.toArray(),
    db.products.toArray(),
  ])

  const activeCategories = categories
    .filter((category) => category.active)
    .sort((a, b) => a.position - b.position)

  const activeCategoryIds = new Set(
    activeCategories.map((category) => category.id),
  )

  return {
    categories: activeCategories,
    products: products
      .filter(
        (product) =>
          product.active &&
          activeCategoryIds.has(product.categoryId),
      )
      .sort((a, b) => a.position - b.position),
  }
}
