import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '../../shared/database/db'
import type { ConfirmedOrder } from '../orders/orderRepository'

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
  const orders = useLiveQuery(
    () => db.table<ConfirmedOrder, string>('orders').toArray(),
    [],
  )

  if (orders === undefined) {
    return (
      <section className="admin-account">
        <p role="status">Chargement des statistiques...</p>
      </section>
    )
  }

  const stats = calculateRestaurantStats(
    orders,
    period,
  )

  return (
    <section className="admin-account">
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
