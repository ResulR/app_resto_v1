import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../shared/database/db'
import { getAvailableOptionsForProduct } from '../catalogue/availabilityRepository'
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
  onCancel: () => void
  onConfirm: (
    product: Product,
    options: SelectedOption[],
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
  onCancel,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const data = useLiveQuery(async () => {
    const [links, groups, availableOptions] = await Promise.all([
      db.productOptionGroups
        .where('productId')
        .equals(product.id)
        .toArray(),
      db.optionGroups.orderBy('position').toArray(),
      getAvailableOptionsForProduct(product.id),
    ])

    const ids = new Set(links.map(link => link.groupId))

    return {
      groups: groups.filter(group => ids.has(group.id)),
      options: availableOptions,
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

      if (!currentProduct?.active) {
        throw new Error('Ce produit est indisponible.')
      }

      const available = await getAvailableOptionsForProduct(product.id)
      const availableIds = new Set(available.map(option => option.id))

      if (selected.some(id => !availableIds.has(id))) {
        throw new Error(
          'Une option sélectionnée est devenue indisponible.',
        )
      }

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

      onConfirm(currentProduct, choices)
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

          {data?.groups.map(group => {
            const options = data.options.filter(
              option => option.groupId === group.id,
            )

            if (options.length === 0) return null

            return (
              <div className="customizer-group" key={group.id}>
                <div className="customizer-group-header">
                  <h3>{group.name}</h3>

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
