import type { CartItem } from './cart'
import type { ConsumptionMode } from './orderRepository'
import { calculateCartAmounts, calculateLineAmount } from './pricing'

function formatPrice(cents: number) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function OrderSummary({
  items,
  comment,
  onCommentChange,
  onQuantityChange,
  onEdit,
  consumptionMode,
  onConsumptionModeChange,
  onFinish,
  saving,
}: {
  items: CartItem[]
  onFinish: () => void
  saving: boolean
  consumptionMode: ConsumptionMode
  onConsumptionModeChange: (mode: ConsumptionMode) => void
  comment: string
  onCommentChange: (value: string) => void
  onQuantityChange: (id: string, delta: 1 | -1) => void
  onEdit: (item: CartItem) => void
}) {
  const amounts = calculateCartAmounts(items)

  return (
    <aside
      className="order-panel"
      aria-label="Récapitulatif de commande"
    >
      <div className="order-header">
        <div>
          <span className="eyebrow">RÉCAPITULATIF</span>
          <h2>Commande</h2>
        </div>

        <span className="order-count">
          {items.reduce((sum, item) => sum + item.quantity, 0)} articles
        </span>
      </div>

      <p className="order-subtitle">
        Commande en préparation.
      </p>

      <div className="order-items">
        {items.length === 0 ? (
          <div className="empty-catalogue">
            Sélectionnez un produit pour commencer.
          </div>
        ) : (
          items.map(item => (
            <div className="order-item" key={item.id}>
              <div className="item-quantity">{item.quantity}×</div>

              <div className="item-details">
                <strong>{item.name}</strong>

                {item.options.map(option => (
                  <span key={option.id}>
                    {option.groupName} : {option.name}
                  </span>
                ))}

                {item.note && (
                  <span className="order-item-note">
                    Note : {item.note}
                  </span>
                )}

                <div className="cart-item-actions">
                  <button
                    type="button"
                    aria-label={`Retirer une unité de ${item.name}`}
                    onClick={() => onQuantityChange(item.id, -1)}
                  >
                    −
                  </button>

                  <span>{item.quantity}</span>

                  <button
                    type="button"
                    aria-label={`Ajouter une unité de ${item.name}`}
                    onClick={() => onQuantityChange(item.id, 1)}
                  >
                    +
                  </button>

                  {!item.productId.startsWith('free:') && (
                    <button
                      type="button"
                      className="cart-edit-button"
                      onClick={() => onEdit(item)}
                    >
                      Modifier
                    </button>
                  )}
                </div>
              </div>

              <strong className="item-price">
                {(() => {
                  const amount = calculateLineAmount(item)

                  if (!amount.hasKnownPrice) {
                    return 'Prix non renseigné'
                  }

                  return (
                    <>
                      {formatPrice(amount.knownCents)}
                      {!amount.complete && (
                        <span className="partial-price-label">
                          Partiel
                        </span>
                      )}
                    </>
                  )
                })()}
              </strong>
            </div>
          ))
        )}
      </div>

      <div className="order-footer">
        <div className="order-comment-field">
          <label htmlFor="order-comment">
            Commentaire général (facultatif)
          </label>

          <textarea
            id="order-comment"
            rows={3}
            maxLength={2000}
            value={comment}
            placeholder="Instructions pour toute la commande..."
            onChange={event => onCommentChange(event.target.value)}
          />
        </div>

        {items.length > 0 && (
          <>
            <div className="total-row">
              <span>
                {amounts.complete
                  ? 'Total'
                  : 'Montant connu'}
              </span>

              <strong>
                {amounts.hasKnownPrice
                  ? formatPrice(amounts.knownCents)
                  : 'Non renseigné'}
              </strong>
            </div>

            {!amounts.complete && (
              <p className="order-price-warning">
                Total incomplet : au moins un produit
                ou une option n'a pas de prix renseigné.
              </p>
            )}
          </>
        )}

        <fieldset className="consumption-mode">
          <legend>Mode de consommation (facultatif)</legend>

          <div className="consumption-mode-buttons">
            <button
              type="button"
              className={
                consumptionMode === 'sur_place'
                  ? 'consumption-choice selected'
                  : 'consumption-choice'
              }
              aria-pressed={consumptionMode === 'sur_place'}
              onClick={() =>
                onConsumptionModeChange(
                  consumptionMode === 'sur_place'
                    ? null
                    : 'sur_place',
                )
              }
            >
              Sur place
            </button>

            <button
              type="button"
              className={
                consumptionMode === 'emporter'
                  ? 'consumption-choice selected'
                  : 'consumption-choice'
              }
              aria-pressed={consumptionMode === 'emporter'}
              onClick={() =>
                onConsumptionModeChange(
                  consumptionMode === 'emporter'
                    ? null
                    : 'emporter',
                )
              }
            >
              À emporter
            </button>
          </div>
        </fieldset>

        <button
          className="finish-button"
          type="button"
          disabled={saving || items.length === 0}
          onClick={onFinish}
        >
          Terminer la commande
          <span>→</span>
        </button>

        <p className="demo-note">
          Brouillon temporaire — aucune commande validée.
        </p>
      </div>
    </aside>
  )
}
