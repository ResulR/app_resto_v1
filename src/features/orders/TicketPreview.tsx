import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import type { ConfirmedOrder } from './orderRepository'
import { createPreparationTicket } from './ticket'
import { getPrinterMode } from '../printing/printerRepository'
import { printTicket } from '../printing/browserPrint'

type Props = {
  order: ConfirmedOrder
}

export function TicketPreview({ order }: Props) {
  const printerMode = useLiveQuery(
    () => getPrinterMode(),
    [],
  )

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const ticket = createPreparationTicket(order)

  function printPreparationTicket() {
    setError('')
    setMessage('')

    if (printerMode !== 'browser') {
      setError(
        'Activez le mode Navigateur dans les paramètres ' +
        'd’impression avant de continuer.',
      )
      return
    }

    try {
      printTicket(ticket)

      setMessage(
        'Dialogue d’impression demandé. ' +
        'Vérifiez le résultat sur l’imprimante.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Impossible de lancer l’impression.',
      )
    }
  }

  return (
    <section
      className="ticket-preview"
      aria-label={`Ticket de préparation ${order.id}`}
    >
      <pre className="ticket-preview-content">
        {ticket}
      </pre>

      <button
        type="button"
        className="printer-test-button"
        disabled={printerMode !== 'browser'}
        onClick={printPreparationTicket}
        aria-label={
          `Imprimer le bon de préparation ${order.id}`
        }
      >
        Imprimer le bon
      </button>

      <p className="ticket-preview-note">
        {printerMode === undefined
          ? 'Chargement du réglage d’impression...'
          : printerMode === 'disabled'
            ? 'Impression désactivée dans les paramètres.'
            : 'Impression manuelle via le navigateur.'}
      </p>

      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
