import { db } from '../../shared/database/db'
import type {
  CashConsumptionMode,
  SaleTaxBreakdown,
  SaleValuation,
  SaleValuationLine,
  TaxConfiguration,
} from '../../shared/database/models'

const MAX_AMOUNT_CENTS = 100000000

export function validateTaxRate(rate: number): number {
  if (
    !Number.isSafeInteger(rate) ||
    rate < 0 ||
    rate > 10000
  ) {
    throw new Error('Taux de TVA invalide.')
  }

  return rate
}

export function calculateIncludedTax(
  grossCents: number,
  rateBasisPoints: number,
): {
  grossCents: number
  netCents: number
  taxCents: number
} {
  validateTaxRate(rateBasisPoints)

  if (
    !Number.isSafeInteger(grossCents) ||
    grossCents < 0 ||
    grossCents > MAX_AMOUNT_CENTS
  ) {
    throw new Error('Montant TTC invalide.')
  }

  const netCents = Math.round(
    grossCents * 10000 / (10000 + rateBasisPoints),
  )

  return {
    grossCents,
    netCents,
    taxCents: grossCents - netCents,
  }
}

export function calculateTaxBreakdown(
  lines: readonly SaleValuationLine[],
  rates: ReadonlyMap<string, number>,
): {
  lines: SaleValuationLine[]
  taxBreakdown: SaleTaxBreakdown[]
  totalTtcCents: number
} {
  if (!lines.length) {
    throw new Error('Vente sans lignes.')
  }

  const resultLines: SaleValuationLine[] = []
  const groups = new Map<number, SaleTaxBreakdown>()
  let totalTtcCents = 0

  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      !Number.isSafeInteger(line.unitTtcCents) ||
      !Number.isSafeInteger(line.lineTtcCents) ||
      line.unitTtcCents! * line.quantity !==
        line.lineTtcCents
    ) {
      throw new Error('Ligne sans prix TTC complet.')
    }

    const rate = rates.get(line.productId)

    if (rate === undefined) {
      throw new Error(
        `TVA non configurée pour le produit ${line.productId}.`,
      )
    }

    const amount = calculateIncludedTax(
      line.lineTtcCents!,
      rate,
    )

    totalTtcCents += amount.grossCents

    if (
      !Number.isSafeInteger(totalTtcCents) ||
      totalTtcCents > MAX_AMOUNT_CENTS
    ) {
      throw new Error('Total TTC trop élevé.')
    }

    resultLines.push({
      ...line,
      taxRateBasisPoints: rate,
      netCents: amount.netCents,
      taxCents: amount.taxCents,
    })

    const group = groups.get(rate) ?? {
      rateBasisPoints: rate,
      totalTtcCents: 0,
      totalHtCents: 0,
      taxCents: 0,
    }

    group.totalTtcCents += amount.grossCents
    group.totalHtCents += amount.netCents
    group.taxCents += amount.taxCents
    groups.set(rate, group)
  }

  return {
    lines: resultLines,
    taxBreakdown: [...groups.values()].sort(
      (a, b) => a.rateBasisPoints - b.rateBasisPoints,
    ),
    totalTtcCents,
  }
}

export async function saveTaxConfiguration(
  productId: string,
  consumptionMode: CashConsumptionMode,
  rateBasisPoints: number,
): Promise<TaxConfiguration> {
  if (!productId.trim()) {
    throw new Error('Produit obligatoire.')
  }

  if (
    consumptionMode !== 'sur_place' &&
    consumptionMode !== 'emporter'
  ) {
    throw new Error('Mode de consommation invalide.')
  }

  validateTaxRate(rateBasisPoints)

  return db.transaction(
    'rw',
    db.taxConfigurations,
    async () => {
      const existing = await db.taxConfigurations
        .where('[productId+consumptionMode]')
        .equals([productId, consumptionMode])
        .toArray()

      if (existing.length > 1) {
        throw new Error('Configurations TVA dupliquées.')
      }

      const config: TaxConfiguration = {
        id: existing[0]?.id ?? crypto.randomUUID(),
        productId,
        consumptionMode,
        rateBasisPoints,
        updatedAt: new Date().toISOString(),
      }

      await db.taxConfigurations.put(config)
      return structuredClone(config)
    },
  )
}

export async function applyTaxToDraftValuation(
  orderId: string,
  consumptionMode: CashConsumptionMode,
): Promise<SaleValuation> {
  if (
    consumptionMode !== 'sur_place' &&
    consumptionMode !== 'emporter'
  ) {
    throw new Error('Mode de consommation invalide.')
  }

  return db.transaction(
    'rw',
    db.salesValuations,
    db.taxConfigurations,
    db.paymentAllocations,
    async () => {
      const valuations = await db.salesValuations
        .where('orderId')
        .equals(orderId)
        .toArray()

      if (valuations.length !== 1) {
        throw new Error(
          'Valorisation de vente unique requise.',
        )
      }

      const valuation = valuations[0]

      if (valuation.status !== 'draft') {
        throw new Error('Valorisation déjà verrouillée.')
      }

      const allocation = await db.paymentAllocations
        .where('orderId')
        .equals(orderId)
        .first()

      if (allocation) {
        throw new Error('Vente déjà encaissée.')
      }

      if (
        valuation.totalTtcCents === undefined ||
        !valuation.lines.length
      ) {
        throw new Error('Prix de vente incomplets.')
      }

      const rates = new Map<string, number>()

      for (const productId of new Set(
        valuation.lines.map(line => line.productId),
      )) {
        const configs = await db.taxConfigurations
          .where('[productId+consumptionMode]')
          .equals([productId, consumptionMode])
          .toArray()

        if (configs.length > 1) {
          throw new Error('Configurations TVA dupliquées.')
        }

        if (configs.length === 1) {
          rates.set(
            productId,
            validateTaxRate(configs[0].rateBasisPoints),
          )
        }
      }

      const computed = calculateTaxBreakdown(
        valuation.lines,
        rates,
      )

      if (
        computed.totalTtcCents !==
        valuation.totalTtcCents
      ) {
        throw new Error('Total TTC incohérent.')
      }

      const updated: SaleValuation = {
        ...valuation,
        ...computed,
        consumptionMode,
      }

      await db.salesValuations.put(updated)
      return structuredClone(updated)
    },
  )
}
