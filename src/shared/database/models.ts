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
  archived?: boolean
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

// C1 : écritures de caisse distinctes des commandes validées.
// Aucun montant absent n'est interprété comme zéro.
export type CashConsumptionMode = 'sur_place' | 'emporter'
export type PaymentMethod = 'cash' | 'card'

export interface SaleValuationLine {
  itemId: string
  productId: string
  label: string
  quantity: number
  unitTtcCents?: number
  lineTtcCents?: number
  source: 'catalog' | 'manual' | 'missing'
  taxRateBasisPoints?: number
  netCents?: number
  taxCents?: number
}

export interface SaleTaxBreakdown {
  rateBasisPoints: number
  totalTtcCents: number
  totalHtCents: number
  taxCents: number
}

export interface SaleValuation {
  id: string
  orderId: string
  createdAt: string
  // En C2/C3, les ventilations seront figées avant tout encaissement.
  status: 'draft' | 'locked'
  totalTtcCents?: number
  consumptionMode?: CashConsumptionMode
  lines: SaleValuationLine[]
  taxBreakdown?: SaleTaxBreakdown[]
}

export interface Payment {
  id: string
  createdAt: string
  method: PaymentMethod
  // Montant effectivement attribué aux ventes, hors monnaie rendue.
  amountCents: number
  receivedCents?: number
  changeCents?: number
  // Confirmation manuelle obligatoire pour les règlements par carte (C4).
  cardConfirmed?: boolean
  // C5 : sélection originale conservée pour les réessais idempotents.
  requestedOrderIds?: string[]
}

export interface PaymentAllocation {
  id: string
  paymentId: string
  orderId: string
  amountCents: number
}

export interface TaxConfiguration {
  id: string
  productId: string
  consumptionMode: CashConsumptionMode
  // Exprimé en points de base : 600 = 6 %, 1200 = 12 %.
  rateBasisPoints: number
  updatedAt: string
}
