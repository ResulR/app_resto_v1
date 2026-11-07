import type { ConfirmedOrder } from './orderRepository'
import { createPreparationTicket } from './ticket'

type Props = {
  order: ConfirmedOrder
}

export function TicketPreview({ order }: Props) {
  return (
    <section
      className="ticket-preview"
      aria-label={`Ticket de préparation ${order.id}`}
    >
      <pre className="ticket-preview-content">
        {createPreparationTicket(order)}
      </pre>

      <p className="ticket-preview-note">
        Aperçu uniquement — aucune impression automatique
        n'est encore configurée.
      </p>
    </section>
  )
}
