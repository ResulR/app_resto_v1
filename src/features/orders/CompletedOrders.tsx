import { useLiveQuery } from 'dexie-react-hooks'
import { listCompletedOrders } from './orderRepository'

function formatPrice(cents: number) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('fr-BE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function CompletedOrders() {
  const orders = useLiveQuery(
    () => listCompletedOrders(),
    [],
  )

  return (
    <section
      className="completed-orders"
      aria-label="Historique des commandes terminées"
    >
      <div className="products-heading">
        <h2>Historique des commandes</h2>
        <span>
          {orders === undefined
            ? 'Chargement...'
            : `${orders.length} terminée(s)`}
        </span>
      </div>

      {orders === undefined && (
        <p role="status">Chargement de l'historique...</p>
      )}

      {orders?.length === 0 && (
        <div className="empty-catalogue">
          Aucune commande terminée.
        </div>
      )}

      <div className="completed-orders-list">
        {orders?.map(order => (
          <article
            key={order.id}
            className="completed-order-card"
          >
            <div className="completed-order-header">
              <div className="completed-order-identity">
                <strong title={order.id}>
                  Commande #{order.id.toUpperCase()}
                </strong>

                <span>
                  Créée : {formatDate(order.createdAt)}
                </span>

                <span>
                  Terminée : {
                    order.completedAt
                      ? formatDate(order.completedAt)
                      : 'Date non renseignée'
                  }
                </span>
              </div>

              <span className="completed-order-status">
                Terminée
              </span>
            </div>

            <div className="completed-order-summary">
              <span>
                {order.items.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                )} article(s)
              </span>

              <strong>
                {order.totalComplete
                  ? 'Total : '
                  : 'Montant connu : '}
                {formatPrice(order.knownTotalCents)}
              </strong>
            </div>

            <details className="completed-order-details">
              <summary>Consulter la commande</summary>

              <div className="completed-order-content">
                {order.items.map(item => (
                  <div
                    key={item.id}
                    className="completed-order-item"
                  >
                    <strong>
                      {item.quantity} × {item.name}
                    </strong>

                    {item.priceCents !== undefined && (
                      <span>
                        Prix unitaire : {
                          formatPrice(item.priceCents)
                        }
                      </span>
                    )}

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
                  <p className="completed-order-comment">
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

                <p className="completed-order-readonly">
                  Commande terminée — consultation uniquement.
                </p>
              </div>
            </details>
          </article>
        ))}
      </div>
    </section>
  )
}
