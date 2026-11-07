import { useState, type FormEvent } from 'react'
import type { FreeItemInput } from './cart'

type Props = {
  onCancel: () => void
  onConfirm: (input: FreeItemInput) => void
}

export function FreeItemForm({ onCancel, onConfirm }: Props) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      const parsedQuantity = Number(quantity)

      if (
        !/^\d+$/.test(quantity) ||
        !Number.isSafeInteger(parsedQuantity) ||
        parsedQuantity < 1 ||
        parsedQuantity > 999
      ) {
        throw new Error('Quantité invalide : 1 à 999.')
      }

      onConfirm({
        name,
        quantity: parsedQuantity,
        price,
        note,
      })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Impossible d’ajouter le produit.',
      )
    }
  }

  return (
    <div className="customizer-overlay">
      <section
        className="customizer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-item-title"
      >
        <div className="customizer-header">
          <div>
            <span className="eyebrow">COMMANDE</span>
            <h2 id="free-item-title">Produit libre</h2>
          </div>

          <button
            type="button"
            aria-label="Fermer"
            onClick={onCancel}
          >
            ✕
          </button>
        </div>

        <p className="customizer-description">
          Article ponctuel, non ajouté au catalogue.
        </p>

        <form className="free-item-form" onSubmit={submit}>
          <label htmlFor="free-item-name">
            Nom du produit
          </label>

          <input
            id="free-item-name"
            required
            maxLength={120}
            autoFocus
            placeholder="Nom de l'article"
            value={name}
            onChange={event => setName(event.target.value)}
          />

          <label htmlFor="free-item-quantity">
            Quantité
          </label>

          <input
            id="free-item-quantity"
            type="number"
            min={1}
            max={999}
            step={1}
            required
            value={quantity}
            onChange={event => setQuantity(event.target.value)}
          />

          <label htmlFor="free-item-price">
            Prix unitaire facultatif (€)
          </label>

          <input
            id="free-item-price"
            type="text"
            inputMode="decimal"
            placeholder="Ex. 4,50"
            value={price}
            onChange={event => setPrice(event.target.value)}
          />

          <label htmlFor="free-item-note">
            Note facultative
          </label>

          <textarea
            id="free-item-note"
            rows={3}
            maxLength={1000}
            placeholder="Instructions pour cet article..."
            value={note}
            onChange={event => setNote(event.target.value)}
          />

          {error && (
            <p role="alert" className="category-error">
              {error}
            </p>
          )}

          <div className="customizer-footer">
            <button
              type="button"
              className="customizer-cancel"
              onClick={onCancel}
            >
              Annuler
            </button>

            <button
              type="submit"
              className="customizer-confirm"
              disabled={!name.trim()}
            >
              Ajouter à la commande
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
