export interface Category {
  id: string
  name: string
  position: number
  active: boolean
}

export interface Product {
  id: string
  categoryId: string
  name: string
  description?: string
  priceCents?: number
  position: number
  active: boolean
}

export interface ProductVariant {
  id: string
  productId: string
  name: string
  priceCents?: number
  position: number
}

export interface OptionGroup {
  id: string
  name: string
  position: number
}

export interface ProductOptionGroup {
  id: string
  productId: string
  groupId: string
}

export interface ProductOption {
  id: string
  groupId: string
  name: string
  priceCents?: number
  position: number
  active: boolean
}

export interface DraftOrder {
  id: string
  updatedAt: string
  payload: unknown
}
