import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../shared/database/db'
import {
  listActiveOrders,
  listCompletedOrders,
  type ConfirmedOrder,
} from '../orders/orderRepository'
import type {
  CashConsumptionMode,
  SaleValuation,
} from '../../shared/database/models'
import {
  calculateSaleLines,
  parseManualPrice,
  saveDraftSaleValuation,
} from './saleValuation'
import {
  applyTaxToDraftValuation,
  saveTaxConfiguration,
} from './saleTax'
import {
  recordMultiOrderPayment,
} from './multiOrderPayment'
import {
  beginPaymentAttempt,
  finishPaymentAttempt,
  loadPendingPayment,
  type PendingPaymentAttempt,
} from './paymentAttempt'
import './CashRegister.css'

const money = (cents: number) =>
  new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)

function modeFor(
  order: ConfirmedOrder,
  modes: Record<string, string>,
): CashConsumptionMode | null {
  const mode = modes[order.id] ?? order.consumptionMode
  return mode === 'sur_place' || mode === 'emporter'
    ? mode
    : null
}

export function CashRegister() {
  const data = useLiveQuery(async () => {
    const [active, completed, sales, allocations, configs] =
      await Promise.all([
        listActiveOrders(),
        listCompletedOrders(),
        db.salesValuations.toArray(),
        db.paymentAllocations.toArray(),
        db.taxConfigurations.toArray(),
      ])

    const valuations = new Map(
      sales.map(sale => [sale.orderId, sale]),
    )
    const paid = new Map<string, number>()

    for (const allocation of allocations) {
      paid.set(
        allocation.orderId,
        (paid.get(allocation.orderId) ?? 0) +
          allocation.amountCents,
      )
    }

    const orders = [...active, ...completed].filter(order => {
      const total = valuations.get(order.id)?.totalTtcCents
      return total === undefined ||
        (paid.get(order.id) ?? 0) < total
    })

    return { orders, valuations, paid, configs }
  }, [])

  const [selected, setSelected] = useState<string[]>([])
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [taxes, setTaxes] = useState<Record<string, string>>({})
  const [modes, setModes] = useState<Record<string, string>>({})
  const [method, setMethod] = useState<'cash' | 'card'>('cash')
  const [amount, setAmount] = useState('')
  const [cardConfirmed, setCardConfirmed] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [pendingAttempt, setPendingAttempt] =
    useState<PendingPaymentAttempt | null>(() => {
      try {
        return loadPendingPayment(window.localStorage)
      } catch {
        return null
      }
    })

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const chosen = data?.orders.filter(
    order => selected.includes(order.id),
  ) ?? []

  const prepared = chosen.length > 0 &&
    chosen.every(order => {
      const sale = data?.valuations.get(order.id)
      return sale?.totalTtcCents !== undefined &&
        sale.taxBreakdown !== undefined &&
        sale.taxBreakdown.length > 0
    })

  const due = chosen.reduce((sum, order) => {
    const total = data?.valuations.get(order.id)?.totalTtcCents
    return sum + (
      total === undefined
        ? 0
        : Math.max(0, total - (data?.paid.get(order.id) ?? 0))
    )
  }, 0)

  function toggle(id: string) {
    setDirty(true)
    setError('')
    setMessage('')
    setSelected(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id],
    )
  }

  function configKey(
    productId: string,
    mode: CashConsumptionMode,
  ) {
    return JSON.stringify([productId, mode])
  }

  function configuredRate(
    productId: string,
    mode: CashConsumptionMode,
  ) {
    const key = configKey(productId, mode)
    const entered = taxes[key]

    if (entered !== undefined) return entered

    const stored = data?.configs.find(config =>
      config.productId === productId &&
      config.consumptionMode === mode
    )

    return stored
      ? String(stored.rateBasisPoints / 100)
      : ''
  }

  async function execute(task: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setMessage('')

    try {
      await task()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Opération de caisse impossible.',
      )
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function prepare() {
    await execute(async () => {
      if (!data || chosen.length === 0) {
        throw new Error('Sélectionnez une commande.')
      }

      // Prévalidation globale avant toute écriture.
      const plans = chosen.map(order => {
        const existing = data.valuations.get(order.id)

        if (existing?.status === 'locked') {
          if (
            existing.totalTtcCents === undefined ||
            !existing.taxBreakdown?.length
          ) {
            throw new Error('Vente verrouillée incomplète.')
          }
          return { order, existing, locked: true as const }
        }

        const mode = modeFor(order, modes)
        if (!mode) {
          throw new Error(
            `Mode de consommation manquant : ${order.id}`,
          )
        }

        const overrides = order.items
          .filter(item =>
            prices[`${order.id}:${item.id}`] !== undefined
          )
          .map(item => ({
            itemId: item.id,
            unitPrice: prices[`${order.id}:${item.id}`],
          }))

        // Une saisie manuelle déjà enregistrée est conservée
        // en l'absence de nouvelle saisie dans l'interface.
        for (const line of existing?.lines ?? []) {
          if (
            line.source === 'manual' &&
            line.unitTtcCents !== undefined &&
            !overrides.some(value =>
              value.itemId === line.itemId
            )
          ) {
            overrides.push({
              itemId: line.itemId,
              unitPrice: (
                line.unitTtcCents / 100
              ).toFixed(2),
            })
          }
        }

        const calculated = calculateSaleLines(
          order.items,
          overrides,
        )

        if (!calculated.complete) {
          throw new Error(
            `Prix incomplets : ${order.id}`,
          )
        }

        const rates = new Map<string, number>()

        for (const line of calculated.lines) {
          const entered = configuredRate(
            line.productId,
            mode,
          )
          const rate = Number(entered.replace(',', '.'))

          if (
            entered.trim() === '' ||
            !/^\d+(?:[.,]\d{1,2})?$/.test(
              entered.trim(),
            ) ||
            !Number.isSafeInteger(rate * 100) ||
            rate < 0 ||
            rate > 100
          ) {
            throw new Error(
              `TVA manquante ou invalide : ${line.label}`,
            )
          }

          rates.set(line.productId, rate * 100)
        }

        return {
          order,
          existing,
          locked: false as const,
          mode,
          overrides,
          rates,
        }
      })

      for (const plan of plans) {
        if (plan.locked) continue

        for (const [productId, rate] of plan.rates) {
          await saveTaxConfiguration(
            productId,
            plan.mode,
            rate,
          )
        }

        await saveDraftSaleValuation(
          plan.order.id,
          plan.overrides,
        )

        await applyTaxToDraftValuation(
          plan.order.id,
          plan.mode,
        )
      }

      setDirty(false)
      setMessage('Ventes préparées avec TVA.')
    })
  }

  async function pay() {
    await execute(async () => {
      if (!data || chosen.length === 0 || !prepared || dirty) {
        throw new Error(
          'Préparez les prix et la TVA avant paiement.',
        )
      }

      // Cette vérification est également faite dans beginPaymentAttempt.
      // Un ancien encaissement incertain interdit un nouvel UUID.
      if (loadPendingPayment(window.localStorage)) {
        throw new Error(
          'Réconciliez le paiement précédent avant de continuer.',
        )
      }

      const cents = parseManualPrice(amount)

      if (cents <= 0 || due <= 0) {
        throw new Error('Montant à encaisser invalide.')
      }

      const attempt = beginPaymentAttempt(window.localStorage, {
        id: crypto.randomUUID(),
        orderIds: chosen.map(order => order.id),
        method,
        tenderedCents: cents,
        ...(method === 'card' ? { cardConfirmed } : {}),
      })

      setPendingAttempt(attempt)

      // Une réponse perdue ne supprime pas l'UUID.
      // Le moteur reconnaîtra une répétition identique.
      const result = await recordMultiOrderPayment(attempt)

      finishPaymentAttempt(window.localStorage, attempt.id)
      setPendingAttempt(null)

      setMessage(
        `Paiement enregistré : ${money(result.payment.amountCents)}` +
        (result.payment.changeCents
          ? ` — Monnaie : ${money(result.payment.changeCents)}`
          : ''),
      )
      setAmount('')
      setCardConfirmed(false)
    })
  }

  async function recoverPayment() {
    await execute(async () => {
      const attempt = loadPendingPayment(window.localStorage)

      if (!attempt) {
        setPendingAttempt(null)
        throw new Error('Aucun paiement à réconcilier.')
      }

      // L'identifiant et les paramètres sont strictement conservés.
      // Aucun nouveau paiement n'est créé si cette tentative
      // avait déjà été enregistrée dans IndexedDB.
      const result = await recordMultiOrderPayment(attempt)

      finishPaymentAttempt(window.localStorage, attempt.id)
      setPendingAttempt(null)
      setAmount('')
      setCardConfirmed(false)

      setMessage(
        `Paiement réconcilié : ${money(result.payment.amountCents)}`,
      )
    })
  }

  return (
    <section className="cash-register" aria-label="Caisse">
      <div className="products-heading">
        <h2>Caisse — encaissements</h2>
        <span>{chosen.length} sélectionnée(s)</span>
      </div>

      <p>
        Sélectionnez les commandes, renseignez les prix et
        la TVA, puis encaissez. Une commande terminée peut
        rester impayée.
      </p>

      {!data && <p role="status">Chargement de la caisse...</p>}

      {data?.orders.length === 0 && (
        <p>Aucune commande à encaisser.</p>
      )}

      <div className="cash-order-list">
        {data?.orders.map(order => {
          const sale: SaleValuation | undefined =
            data.valuations.get(order.id)
          const remaining = sale?.totalTtcCents === undefined
            ? undefined
            : sale.totalTtcCents -
              (data.paid.get(order.id) ?? 0)

          return (
            <label className="cash-order" key={order.id}>
              <input
                type="checkbox"
                checked={selected.includes(order.id)}
                disabled={busy}
                onChange={() => toggle(order.id)}
              />
              <span>
                <strong>#{order.id.slice(0, 8)}</strong>
                {' — '}
                {order.status === 'completed'
                  ? 'Terminée'
                  : 'Active'}
              </span>
              <strong>
                {remaining === undefined
                  ? 'Prix à préparer'
                  : money(remaining)}
              </strong>
            </label>
          )
        })}
      </div>

      {chosen.map(order => {
        const sale = data?.valuations.get(order.id)
        const locked = sale?.status === 'locked'
        const mode = modeFor(order, modes)

        return (
          <fieldset
            className="cash-order-editor"
            key={order.id}
            disabled={busy || locked}
          >
            <legend>Commande #{order.id.slice(0, 8)}</legend>

            {locked && (
              <p>Vente verrouillée après premier paiement.</p>
            )}

            <label>
              Mode de consommation
              <select
                value={mode ?? ''}
                onInput={() => setDirty(true)}
onChange={event => setModes(current => ({
                  ...current,
                  [order.id]: event.target.value,
                }))}
              >
                <option value="">Choisir</option>
                <option value="sur_place">Sur place</option>
                <option value="emporter">À emporter</option>
              </select>
            </label>

            {order.items.map(item => {
              const key = `${order.id}:${item.id}`
              const previous = sale?.lines.find(
                line => line.itemId === item.id,
              )
              const original = calculateSaleLines([item])
              const knownUnit = original.complete
                ? original.lines[0].unitTtcCents
                : undefined

              const productKey = mode
                ? configKey(item.productId, mode)
                : ''

              return (
                <div className="cash-line" key={item.id}>
                  <strong>
                    {item.quantity} × {item.name}
                  </strong>
                  <label>
                    Prix TTC unitaire (€)
                    <input
                      inputMode="decimal"
                      placeholder={
                        knownUnit === undefined
                          ? 'Prix manquant'
                          : (knownUnit / 100).toFixed(2)
                      }
                      value={
                        prices[key] ??
                        (previous?.source === 'manual'
                          ? (
                              (previous.unitTtcCents ?? 0) / 100
                            ).toFixed(2)
                          : '')
                      }
                      onInput={() => setDirty(true)}
onChange={event =>
                        setPrices(current => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    TVA (%)
                    <input
                      inputMode="decimal"
                      disabled={!mode}
                      placeholder="Taux obligatoire"
                      value={mode
                        ? configuredRate(item.productId, mode)
                        : ''}
                      onInput={() => setDirty(true)}
onChange={event =>
                        setTaxes(current => ({
                          ...current,
                          [productKey]: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              )
            })}
          </fieldset>
        )
      })}

      {pendingAttempt && (
        <div className="admin-account-card" role="status">
          <h3>Paiement à réconcilier</h3>
          <p>
            Une tentative de {money(pendingAttempt.tenderedCents)}
            {' '}est restée sans confirmation locale.
            Ne demandez pas un second règlement au client.
          </p>
          <p>
            Vérifiez le règlement effectué, puis récupérez
            cette même tentative avec son identifiant initial.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void recoverPayment()}
          >
            Réconcilier la tentative
          </button>
        </div>
      )}

      {chosen.length > 0 && (
        <div className="cash-payment">
          <button
            type="button"
            disabled={busy}
            onClick={() => void prepare()}
          >
            Préparer prix et TVA
          </button>

          <p>
            <strong>Solde actuellement préparé : {money(due)}</strong>
          </p>

          <label>
            Moyen de paiement
            <select
              value={method}
              disabled={busy}
              onChange={event => {
                setMethod(event.target.value as 'cash' | 'card')
                setCardConfirmed(false)
              }}
            >
              <option value="cash">Espèces</option>
              <option value="card">Carte</option>
            </select>
          </label>

          <label>
            Montant reçu (€)
            <input
              inputMode="decimal"
              placeholder="Ex. 20,00"
              value={amount}
              disabled={busy}
              onChange={event => setAmount(event.target.value)}
            />
          </label>

          {method === 'card' && (
            <label className="cash-confirm">
              <input
                type="checkbox"
                checked={cardConfirmed}
                disabled={busy}
                onChange={event =>
                  setCardConfirmed(event.target.checked)
                }
              />
              Paiement confirmé sur le terminal bancaire
            </label>
          )}

          <button
            type="button"
            disabled={
              busy ||
              pendingAttempt !== null ||
              !prepared ||
              dirty ||
              due <= 0 ||
              (method === 'card' && !cardConfirmed)
            }
            onClick={() => void pay()}
          >
            {busy ? 'Enregistrement...' : 'Enregistrer le paiement'}
          </button>
        </div>
      )}

      {error && <p role="alert" className="category-error">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
