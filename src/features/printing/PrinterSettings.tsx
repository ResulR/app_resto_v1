import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import {
  getPrinterMode,
  setPrinterMode,
  type PrinterMode,
} from './printerRepository'
import { printTicket } from './browserPrint'

const TEST_TICKET = [
  'RESTAURANT',
  'TICKET DE TEST',
  '------------------------------',
  '2 × Panini poulet',
  '  - Sauce : Andalouse',
  '  NOTE : Bien cuit',
  '',
  'Mode : À EMPORTER',
  '------------------------------',
  'FIN DU TEST',
].join('\n')

export function PrinterSettings() {
  const mode = useLiveQuery(
    () => getPrinterMode(),
    [],
  )

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function changeMode(next: PrinterMode) {
    if (busy) return

    setBusy(true)
    setMessage('')
    setError('')

    try {
      await setPrinterMode(next)
      setMessage('Paramètre enregistré sur cet appareil.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Impossible d’enregistrer le paramètre.',
      )
    } finally {
      setBusy(false)
    }
  }

  function printTest() {
    setError('')
    setMessage('')

    try {
      printTicket(TEST_TICKET)
      setMessage(
        'Dialogue d’impression demandé. ' +
        'La réussite de l’impression doit être vérifiée.',
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
    <section className="printer-settings">
      <div className="section-heading">
        <span className="eyebrow">PARAMÈTRES</span>
        <h1>Impression</h1>
        <p>
          Configurez l’impression des tickets de préparation.
        </p>
      </div>

      <fieldset>
        <legend>Mode d’impression</legend>

        <label>
          <input
            type="radio"
            name="printer-mode"
            checked={mode === 'disabled'}
            disabled={busy || mode === undefined}
            onChange={() => void changeMode('disabled')}
          />
          Désactivé
        </label>

        <label>
          <input
            type="radio"
            name="printer-mode"
            checked={mode === 'browser'}
            disabled={busy || mode === undefined}
            onChange={() => void changeMode('browser')}
          />
          Navigateur
        </label>
      </fieldset>

      <p className="printer-status">
        {mode === undefined
          ? 'Chargement du réglage...'
          : mode === 'disabled'
            ? 'Impression désactivée.'
            : 'Mode navigateur sélectionné.'}
      </p>

      <p className="printer-explanation">
        Le navigateur ne permet pas de détecter de façon fiable
        une imprimante physique. La sélection d’une imprimante
        et la confirmation du tirage dépendent du système.
      </p>

      <button
        type="button"
        className="printer-test-button"
        disabled={mode !== 'browser' || busy}
        onClick={printTest}
      >
        Imprimer un ticket de test
      </button>

      <p className="printer-explanation">
        Aucun ticket automatique n’est lancé à ce stade.
        Une imprimante indisponible ne bloque pas les commandes.
      </p>

      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="category-error">
          {error}
        </p>
      )}
    </section>
  )
}
