import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '../../shared/database/db'
import type { ConfirmedOrder } from '../orders/orderRepository'
import {
  calculateFinancialStats,
} from './financialStats'

import {
  calculateRestaurantStats,
  type StatsPeriod,
} from './stats'

const PERIODS: {
  value: StatsPeriod
  label: string
}[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '7days', label: '7 jours' },
  { value: '30days', label: '30 jours' },
  { value: 'all', label: 'Tout' },
]

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function StatisticsPanel() {
  const [period, setPeriod] = useState<StatsPeriod>('today')

  // Les commandes proviennent exclusivement du stockage
  // local. La page fonctionne donc sans connexion réseau.
  const financialData = useLiveQuery(async () => {
    const [orders, sales, payments, allocations] =
      await Promise.all([
        db.table<ConfirmedOrder, string>('orders').toArray(),
        db.salesValuations.toArray(),
        db.payments.toArray(),
        db.paymentAllocations.toArray(),
      ])

    return { orders, sales, payments, allocations }
  }, [])

  if (financialData === undefined) {
    return (
      <section className="admin-account">
        <p role="status">Chargement des statistiques...</p>
      </section>
    )
  }

  const stats = calculateRestaurantStats(
    financialData.orders,
    period,
  )

  let financial
  let financialError = ''

  try {
    financial = calculateFinancialStats(
      financialData.orders,
      financialData.sales,
      financialData.payments,
      financialData.allocations,
      period,
    )
  } catch (cause) {
    financialError = cause instanceof Error
      ? cause.message
      : 'Statistiques financières indisponibles.'
  }

  return (
    <section className="admin-account statistics-panel">
      <div className="section-heading">
        <span className="eyebrow">SUIVI D'ACTIVITÉ</span>
        <h1>Statistiques</h1>
        <p>
          Données des commandes enregistrées sur cet
          appareil. Disponibles hors ligne.
        </p>
      </div>

      <div
        className="settings-tabs"
        aria-label="Période des statistiques"
      >
        {PERIODS.map(option => (
          <button
            key={option.value}
            type="button"
            className={
              period === option.value ? 'active' : ''
            }
            aria-pressed={period === option.value}
            onClick={() => setPeriod(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="admin-account-card">
        <h2>Commandes</h2>

        <p>
          <strong>{stats.orderCount}</strong>
          {' '}commandes validées
        </p>

        <p>
          <strong>{stats.activeCount}</strong>
          {' '}actives
        </p>

        <p>
          <strong>{stats.completedCount}</strong>
          {' '}terminées
        </p>

        <p>
          <strong>{stats.itemCount}</strong>
          {' '}articles au total
        </p>
      </div>

      <div className="admin-account-card">
        <h2>Montants théoriques connus</h2>

        <p>
          <strong>
            {formatMoney(stats.knownTotalCents)}
          </strong>
        </p>

        <p>
          Somme des prix connus des commandes,
          sans suivi des paiements.
        </p>

        {stats.incompleteOrderCount > 0 && (
          <p className="admin-account-warning" role="status">
            {stats.incompleteOrderCount}
            {' '}commande(s) avec un total incomplet.
            Le montant affiché ne représente pas
            leur valeur totale.
          </p>
        )}
      </div>

      <div className="admin-account-card">
        <h2>Bilan financier V2</h2>

        {financialError && (
          <p role="alert" className="admin-account-warning">
            {financialError}
          </p>
        )}

        {financial && (
          <>
            <p>
              Total des valorisations TTC :{' '}
              <strong>{formatMoney(financial.salesTtcCents)}</strong>
            </p>
            <p>
              Préparées, encore modifiables :{' '}
              <strong>{formatMoney(financial.draftValuationTtcCents)}</strong>
              {' '}({financial.draftValuationCount})
            </p>
            <p>
              Verrouillées après encaissement :{' '}
              <strong>{formatMoney(financial.lockedValuationTtcCents)}</strong>
              {' '}({financial.lockedValuationCount})
            </p>
            <p>
              Total HT :{' '}
              <strong>{formatMoney(financial.salesHtCents)}</strong>
            </p>
            <p>
              TVA calculée :{' '}
              <strong>{formatMoney(financial.salesVatCents)}</strong>
            </p>
            <p>
              Encaissements espèces :{' '}
              <strong>{formatMoney(financial.cashReceivedCents)}</strong>
            </p>
            <p>
              Encaissements carte confirmés :{' '}
              <strong>{formatMoney(financial.cardReceivedCents)}</strong>
            </p>
            <p>
              Total encaissé :{' '}
              <strong>{formatMoney(financial.receivedCents)}</strong>
            </p>
            <p>
              Solde actuellement dû sur les ventes de la période :{' '}
              <strong>{formatMoney(financial.outstandingCents)}</strong>
            </p>
            <p>
              {financial.fullyPaidCount} payée(s),{' '}
              {financial.partiallyPaidCount} partiellement payée(s),{' '}
              {financial.unpaidCount} impayée(s).
            </p>
            <p>
              {financial.unvaluedOrdersCount} commande(s)
              sans valorisation financière complète.
            </p>
            <p className="admin-account-info">
              Ventes classées par date de commande.
              Encaissements classés par date de paiement.
              Les valorisations préparées restent provisoires.
              Une valorisation verrouillée n'est pas, à elle seule,
              une validation du chiffre d'affaires fiscal.
              Les impayés correspondent aux ventes de la
              période, après prise en compte de tous leurs paiements.
            </p>
          </>
        )}
      </div>

      <div className="admin-account-card">
        <h2>Produits les plus commandés</h2>

        {stats.popularProducts.length === 0 ? (
          <p>Aucune commande pour cette période.</p>
        ) : (
          <ol>
            {stats.popularProducts.map(product => (
              <li key={product.key}>
                {product.name}
                {' — '}
                <strong>
                  {product.quantity}
                </strong>
                {' '}unité(s)
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="admin-account-info">
        Les statistiques représentent les commandes
        enregistrées, et non les sommes encaissées.
        Les brouillons sont exclus.
      </p>
    </section>
  )
}
