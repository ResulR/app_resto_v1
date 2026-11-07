import { db } from '../../shared/database/db'

export async function getCatalogue() {
  const [categories, products] = await Promise.all([
    db.categories.toArray(),
    db.products.toArray(),
  ])

  return {
    categories: categories
      .filter((category) => category.active)
      .sort((a, b) => a.position - b.position),

    products: products
      .filter((product) => product.active)
      .sort((a, b) => a.position - b.position),
  }
}
