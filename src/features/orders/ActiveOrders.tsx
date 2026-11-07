import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import {
  listActiveOrders,
  completeOrder,
  type ConfirmedOrder,
} from './orderRepository'

function formatPrice(cents: number) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('fr-BE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function displayNumber(order: ConfirmedOrder) {
  return order.id.toUpperCase()
}

export function ActiveOrders() {
  const orders = useLiveQuery(
    () => listActiveOrders(),
    [],
  )

  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function finish(id: string) {
    if (busyId !== null) return

    setBusyId(id)
    setError('')

    try {
      await completeOrder(id)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Impossible de terminer la commande.',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section
      className="active-orders"
      aria-label="Commandes actives"
    >
      <div className="products-heading">
        <h2>Commandes actives</h2>
        <span>
          {orders === undefined
            ? 'Chargement...'
            : `${orders.length} commande(s)`}
        </span>
      </div>

      {orders === undefined && (
        <p role="status">
          Chargement des commandes actives...
        </p>
      )}

      {orders?.length === 0 && (
        <div className="empty-catalogue">
          Aucune commande active.
        </div>
      )}

      {error && (
        <p className="category-error" role="alert">
          {error}
        </p>
      )}

      <div className="active-orders-list">
        {orders?.map(order => {
          const quantity = order.items.reduce(
            (total, item) => total + item.quantity,
            0,
          )

          return (
            <article
              className="active-order-card"
              key={order.id}
            >
              <div className="active-order-header">
                <div className="active-order-identity">
                  <strong
                    title={`Identifiant complet : ${order.id}`}
                  >
                    Commande #{displayNumber(order)}
                  </strong>

                  <span>{formatDate(order.createdAt)}</span>
                </div>

                <span className="active-order-status">
                  Active
                </span>
              </div>

              <div className="active-order-summary">
                <span>
                  {quantity} article{quantity > 1 ? 's' : ''}
                </span>

                <strong>
                  {order.totalComplete
                    ? 'Total : '
                    : 'Montant connu : '}
                  {formatPrice(order.knownTotalCents)}
                </strong>
              </div>

              <button
                type="button"
                className="complete-order-button"
                disabled={busyId !== null}
                onClick={() => void finish(order.id)}
                aria-label={`Terminer la commande ${displayNumber(order)}`}
              >
                {busyId === order.id
                  ? 'Enregistrement...'
                  : '✓ TERMINÉE'}
              </button>

              <details className="active-order-details">
                <summary>Voir les détails</summary>

                <div className="active-order-content">
                  {order.items.map(item => (
                    <div
                      className="active-order-item"
                      key={item.id}
                    >
                      <strong>
                        {item.quantity} × {item.name}
                      </strong>

                      {item.options.map(option => (
                        <span key={option.id}>
                          {option.groupName} : {option.name}
                          {option.priceCents !== undefined &&
                            ` (+${formatPrice(option.priceCents)})`}
                        </span>
                      ))}

                      {item.note && (
                        <span>Note : {item.note}</span>
                      )}
                    </div>
                  ))}

                  {order.comment && (
                    <p className="active-order-comment">
                      <strong>Commentaire :</strong>{' '}
                      {order.comment}
                    </p>
                  )}

                  <p>
                    <strong>Consommation :</strong>{' '}
                    {order.consumptionMode === 'sur_place'
                      ? 'Sur place'
                      : order.consumptionMode === 'emporter'
                        ? 'À emporter'
                        : 'Non précisé'}
                  </p>

                  {!order.totalComplete && (
                    <p className="order-price-warning">
                      Montant incomplet : certains prix
                      ne sont pas renseignés.
                    </p>
                  )}

                  <p className="active-order-readonly">
                    Commande validée : contenu non modifiable.
                  </p>
                </div>
              </details>
            </article>
          )
        })}
      </div>
    </section>
  )
}
