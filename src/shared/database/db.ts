import Dexie, { type Table } from 'dexie'

import type {
  Category,
  Product,
  ProductVariant,
  OptionGroup,
  ProductOptionGroup,
  ProductOption,
  DraftOrder,
} from './models'

export class RestaurantDatabase extends Dexie {
  categories!: Table<Category, string>
  products!: Table<Product, string>
  variants!: Table<ProductVariant, string>
  optionGroups!: Table<OptionGroup, string>
  productOptionGroups!: Table<ProductOptionGroup, string>
  options!: Table<ProductOption, string>
  drafts!: Table<DraftOrder, string>
  settings!: Table<{ key: string; value: string }, string>

  constructor() {
    super('restaurant-pwa')

    this.version(1).stores({
      categories: 'id, position, active',
      products: 'id, categoryId, position, active',
      variants: 'id, productId, position',
      optionGroups: 'id, position',
      productOptionGroups: 'id, productId, groupId, [productId+groupId]',
      options: 'id, groupId, position, active',
      drafts: 'id, updatedAt',
    })

    // Migration non destructive : commandes définitives.
    this.version(2).stores({
      orders: 'id, createdAt',
    })

    this.version(3).stores({
      settings: 'key',
    })
  }
}

export const db = new RestaurantDatabase()
