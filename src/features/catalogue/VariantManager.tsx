import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../shared/database/db'

import {
  createVariant,
  updateVariant,
  deleteVariant,
  moveVariant,
  type VariantInput,
} from './variantRepository'

type Props = {
  productId: string
  productName: string
  onClose: () => void
}

const emptyForm: VariantInput = {
  name: '',
  price: '',
}

function formatPrice(cents?: number) {
  if (cents === undefined) return 'Prix non renseigné'

  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function VariantManager({
  productId,
  productName,
  onClose,
}: Props) {
  const variants = useLiveQuery(
    () => db.variants
      .where('productId')
      .equals(productId)
      .sortBy('position'),
    [productId],
  )

  const [form, setForm] = useState<VariantInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function execute(action: () => Promise<unknown>) {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      await action()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Une erreur est survenue.',
      )
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    void execute(async () => {
      if (editingId) {
        await updateVariant(editingId, form)
      } else {
        await createVariant(productId, form)
      }

      setForm(emptyForm)
      setEditingId(null)
    })
  }

  function startEdit(id: string, name: string, priceCents?: number) {
    setEditingId(id)
    setForm({
      name,
      price: priceCents === undefined
        ? ''
        : (priceCents / 100).toFixed(2).replace('.', ','),
    })
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`Supprimer la variante « ${name} » ?`)) return

    void execute(async () => {
      await deleteVariant(id)

      if (editingId === id) {
        cancelEdit()
      }
    })
  }

  return (
    <section className="variant-manager">
      <div className="variant-heading">
        <div>
          <span className="eyebrow">PRODUIT</span>
          <h2>Variantes — {productName}</h2>
        </div>

        <button type="button" onClick={onClose}>
          Retour aux produits
        </button>
      </div>

      <p className="variant-description">
        Les variantes sont facultatives. Un produit peut être
        utilisé sans sélectionner de taille.
      </p>

      <form className="product-form" onSubmit={submit}>
        <h3>{editingId ? 'Modifier la variante' : 'Nouvelle variante'}</h3>

        <label htmlFor="variant-name">Nom</label>
        <input
          id="variant-name"
          placeholder="Ex. Petit, Moyen, Grand"
          maxLength={80}
          required
          value={form.name}
          onChange={event =>
            setForm({ ...form, name: event.target.value })
          }
        />

        <label htmlFor="variant-price">Prix facultatif (€)</label>
        <input
          id="variant-price"
          type="text"
          inputMode="decimal"
          placeholder="Ex. 7,50"
          value={form.price}
          onChange={event =>
            setForm({ ...form, price: event.target.value })
          }
        />

        <div className="product-form-actions">
          <button
            className="product-save"
            type="submit"
            disabled={busy || !form.name.trim()}
          >
            {editingId ? 'Enregistrer' : 'Ajouter la variante'}
          </button>

          {editingId && (
            <button type="button" onClick={cancelEdit}>
              Annuler
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className="category-error" role="alert">{error}</p>
      )}

      {variants === undefined && <p>Chargement...</p>}

      {variants?.length === 0 && (
        <div className="empty-catalogue">
          Aucune variante. Ce produit reste disponible sans taille.
        </div>
      )}

      <div className="category-list">
        {variants?.map((variant, index) => (
          <div className="category-row" key={variant.id}>
            <div className="product-row-info">
              <strong>{variant.name}</strong>
              <span>{formatPrice(variant.priceCents)}</span>
            </div>

            <div className="category-actions variant-actions">
              <button
                type="button"
                aria-label={`Monter ${variant.name}`}
                disabled={busy || index === 0}
                onClick={() =>
                  void execute(() => moveVariant(variant.id, -1))
                }
              >
                ↑
              </button>

              <button
                type="button"
                aria-label={`Descendre ${variant.name}`}
                disabled={busy || index === variants.length - 1}
                onClick={() =>
                  void execute(() => moveVariant(variant.id, 1))
                }
              >
                ↓
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  startEdit(
                    variant.id,
                    variant.name,
                    variant.priceCents,
                  )
                }
              >
                Modifier
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => remove(variant.id, variant.name)}
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
