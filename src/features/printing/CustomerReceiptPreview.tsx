import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import type { PrinterMode } from './printerRepository'
import { loadCustomerReceipt } from './customerReceiptRepository'
import { printTicket } from './browserPrint'

type Props = {
  orderId: string
  printerMode: PrinterMode | undefined
}

type ReceiptState = {
  text: string | null
  error: string | null
}

export function CustomerReceiptPreview({
  orderId,
  printerMode,
}: Props) {
  const [message, setMessage] = useState('')
  const [printError, setPrintError] = useState('')

  // La lecture transactionnelle se fait AVANT le clic.
  // Dexie actualise le ticket lorsque les données changent.
  const receipt = useLiveQuery(
    async (): Promise<ReceiptState> => {
      try {
        return {
          text: await loadCustomerReceipt(orderId),
          error: null,
        }
      } catch (cause) {
        return {
          text: null,
          error: cause instanceof Error
            ? cause.message
            : 'Données du ticket client indisponibles.',
        }
      }
    },
    [orderId],
  )

  function printCustomerReceipt() {
    setMessage('')
    setPrintError('')

    if (printerMode !== 'browser') {
      setPrintError(
        'Activez le mode Navigateur dans les paramètres.',
      )
      return
    }

    if (!receipt?.text || receipt.error) {
      setPrintError(
        'Le ticket client n’est pas disponible.',
      )
      return
    }

    try {
      // Aucun accès IndexedDB ni appel réseau au clic.
      printTicket(receipt.text, 'client')

      setMessage(
        'Dialogue d’impression demandé. ' +
        'Vérifiez la sortie papier.',
      )
    } catch (cause) {
      setPrintError(
        cause instanceof Error
          ? cause.message
          : 'Impossible de lancer l’impression.',
      )
    }
  }

  return (
    <section
      className="ticket-preview"
      aria-label={`Ticket client ${orderId}`}
    >
      <h3>Ticket client</h3>

      {receipt === undefined && (
        <p role="status">Préparation du ticket client...</p>
      )}

      {receipt?.error && (
        <p role="alert">
          Ticket indisponible : {receipt.error}
        </p>
      )}

      {receipt?.text === null && !receipt.error && (
        <p>
          Ticket client indisponible tant que les prix
          et la TVA ne sont pas finalisés en caisse.
        </p>
      )}

      {receipt?.text && (
        <pre className="ticket-preview-content">
          {receipt.text}
        </pre>
      )}

      <button
        type="button"
        className="printer-test-button"
        disabled={
          printerMode !== 'browser' ||
          !receipt?.text ||
          Boolean(receipt.error)
        }
        onClick={printCustomerReceipt}
        aria-label={`Imprimer le ticket client ${orderId}`}
      >
        Imprimer le ticket client
      </button>

      <p className="ticket-preview-note">
        Document commercial non certifié.
        Aucun statut d’impression physique n’est enregistré.
      </p>

      {message && <p role="status">{message}</p>}
      {printError && <p role="alert">{printError}</p>}
    </section>
  )
}
