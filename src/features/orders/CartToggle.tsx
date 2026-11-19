import type { CartItem } from './cart'
import { calculateCartAmounts } from './pricing'

function formatPrice(cents: number) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function CartToggle({
  items,
  open,
  onToggle,
}: {
  items: CartItem[]
  open: boolean
  onToggle: () => void
}) {
  const count = items.reduce(
    (total, item) => total + item.quantity,
    0,
  )
  const amounts = calculateCartAmounts(items)

  const amountLabel = amounts.hasKnownPrice
    ? formatPrice(amounts.knownCents)
    : 'Prix non renseigné'

  const heading = amounts.complete
    ? 'Total'
    : 'Montant connu'

  return (
    <button
      type="button"
      className="cart-toggle"
      aria-controls="order-summary"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="cart-toggle-title">
        Panier · {count} article{count > 1 ? 's' : ''}
      </span>

      <span className="cart-toggle-amount">
        {count > 0
          ? `${heading} : ${amountLabel}`
          : 'Panier vide'}
      </span>

      <span aria-hidden="true">
        {open ? 'Fermer −' : 'Ouvrir +'}
      </span>
    </button>
  )
}
