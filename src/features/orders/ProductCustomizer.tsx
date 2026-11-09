import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../shared/database/db'
import { getAvailableOptionsForProduct } from '../catalogue/availabilityRepository'
import type { SelectedVariant } from './cart'
import type {
  Product,
  ProductOption,
} from '../../shared/database/models'

export type SelectedOption = {
  id: string
  name: string
  groupName: string
  priceCents?: number
}

type Props = {
  product: Product
  initialOptions?: SelectedOption[]
  initialNote?: string
  initialVariant?: SelectedVariant
  onCancel: () => void
  onConfirm: (
    product: Product,
    options: SelectedOption[],
    note: string,
    variant?: SelectedVariant,
  ) => void
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function ProductCustomizer({
  product,
  initialOptions = [],
  initialNote = '',
  initialVariant,
  onCancel,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<string[]>(
    () => initialOptions.map(option => option.id),
  )
  const [note, setNote] = useState(initialNote)
  const [variantId, setVariantId] = useState(initialVariant?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const data = useLiveQuery(async () => {
    const [links, groups, availableOptions, variants] = await Promise.all([
      db.productOptionGroups
        .where('productId')
        .equals(product.id)
        .toArray(),
      db.optionGroups.orderBy('position').toArray(),
      getAvailableOptionsForProduct(product.id),
      db.variants.where('productId').equals(product.id).sortBy('position'),
    ])

    const ids = new Set(links.map(link => link.groupId))

    return {
      groups: groups.filter(group => ids.has(group.id)),
      options: availableOptions,
      variants,
    }
  }, [product.id])

  function toggle(id: string) {
    setSelected(current =>
      current.includes(id)
        ? current.filter(value => value !== id)
        : [...current, id],
    )
  }

  function selectAll(options: ProductOption[]) {
    setSelected(current => [
      ...new Set([...current, ...options.map(option => option.id)]),
    ])
  }

  function clearGroup(options: ProductOption[]) {
    const ids = new Set(options.map(option => option.id))
    setSelected(current => current.filter(id => !ids.has(id)))
  }

  async function confirm() {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      const currentProduct = await db.products.get(product.id)

      if (!currentProduct?.active || currentProduct.archived) {
        throw new Error('Ce produit est indisponible ou retiré.')
      }

      const available = await getAvailableOptionsForProduct(product.id)
      const availableIds = new Set(available.map(option => option.id))

      if (selected.some(id => !availableIds.has(id))) {
        throw new Error(
          'Une option sélectionnée est devenue indisponible.',
        )
      }

      const variants = await db.variants
        .where('productId')
        .equals(product.id)
        .toArray()

      const variant = variantId
        ? variants.find(item => item.id === variantId)
        : undefined

      if (variantId && !variant) {
        throw new Error(
          'Cette taille est devenue indisponible.',
        )
      }

      const selectedVariant: SelectedVariant | undefined =
        variant
          ? {
              id: variant.id,
              name: variant.name,
              priceCents: variant.priceCents,
            }
          : undefined

      const groups = await db.optionGroups.toArray()
      const groupNames = new Map(
        groups.map(group => [group.id, group.name]),
      )

      const choices: SelectedOption[] = available
        .filter(option => selected.includes(option.id))
        .map(option => ({
          id: option.id,
          name: option.name,
          groupName: groupNames.get(option.groupId) ?? '',
          priceCents: option.priceCents,
        }))

      onConfirm(
        {
          ...currentProduct,
          priceCents:
            variant?.priceCents ?? currentProduct.priceCents,
        },
        choices,
        note.trim(),
        selectedVariant,
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Impossible de personnaliser ce produit.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="customizer-overlay">
      <section
        className="customizer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customizer-title"
      >
        <div className="customizer-header">
          <div>
            <span className="eyebrow">PERSONNALISATION</span>
            <h2 id="customizer-title">{product.name}</h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <p className="customizer-description">
          Tous les choix sont facultatifs.
          Aucune option n'est sélectionnée par défaut.
        </p>

        <div className="customizer-content">
          {data === undefined && <p>Chargement des options...</p>}

          {data !== undefined &&
            (data.variants.length > 0 || initialVariant) && (
              <fieldset className="customizer-group">
                <legend>Taille / Variante (facultative)</legend>

                <label className="customizer-option">
                  <input
                    type="radio"
                    name="product-variant"
                    checked={variantId === ''}
                    disabled={busy}
                    onChange={() => setVariantId('')}
                  />
                  <span>Sans variante</span>
                </label>

                {data.variants.map(variant => (
                  <label
                    className="customizer-option"
                    key={variant.id}
                  >
                    <input
                      type="radio"
                      name="product-variant"
                      checked={variantId === variant.id}
                      disabled={busy}
                      onChange={() => setVariantId(variant.id)}
                    />
                    <span>{variant.name}</span>
                    {variant.priceCents !== undefined && (
                      <strong>
                        {formatPrice(variant.priceCents)}
                      </strong>
                    )}
                  </label>
                ))}

                {variantId !== '' &&
                  !data.variants.some(
                    variant => variant.id === variantId
                  ) && (
                    <p role="alert" className="category-error">
                      Taille supprimée : choisissez une autre variante.
                    </p>
                  )}
              </fieldset>
            )}

          {data?.groups.map(group => {
            const options = data.options.filter(
              option => option.groupId === group.id,
            )

            if (options.length === 0) return null

            return (
              <div className="customizer-group" key={group.id}>
                <div className="customizer-group-header">
                  <h3>{group.name}</h3>

                  {['salade', 'salades'].includes(
                    group.name.trim().toLocaleLowerCase('fr-BE'),
                  ) && (
                    <div className="customizer-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => selectAll(options)}
                    >
                      Tout sélectionner
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => clearGroup(options)}
                    >
                      Aucune sélection
                    </button>
                  </div>
                  )}
                </div>

                <div className="customizer-options">
                  {options.map(option => (
                    <label
                      className="customizer-option"
                      key={option.id}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(option.id)}
                        disabled={busy}
                        onChange={() => toggle(option.id)}
                      />

                      <span>{option.name}</span>

                      {option.priceCents !== undefined && (
                        <strong>
                          + {formatPrice(option.priceCents)}
                        </strong>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}

          {data?.options.length === 0 && (
            <p>Aucune option disponible pour ce produit.</p>
          )}
        </div>

        <div className="item-note-field">
          <label htmlFor="item-note">
            Note pour cet article (facultatif)
          </label>

          <textarea
            id="item-note"
            rows={3}
            maxLength={1000}
            value={note}
            disabled={busy}
            placeholder="Ex. Bien cuit, sans sel..."
            onChange={event => setNote(event.target.value)}
          />
        </div>

        {error && (
          <p className="category-error" role="alert">{error}</p>
        )}

        <div className="customizer-footer">
          <button
            type="button"
            className="customizer-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Annuler
          </button>

          <button
            type="button"
            className="customizer-confirm"
            disabled={busy || data === undefined}
            onClick={() => void confirm()}
          >
            Ajouter à la commande
          </button>
        </div>
      </section>
    </div>
  )
}
