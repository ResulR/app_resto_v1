import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '../../shared/database/db'
import { setProductAvailability } from './availabilityRepository'
import { VariantManager } from './VariantManager'
import type { Product } from '../../shared/database/models'

import {
  createProduct,
  updateProduct,
  moveProduct,
  archiveProduct,
} from './productRepository'

type FormState = {
  name: string
  categoryId: string
  price: string
}

const emptyForm: FormState = {
  name: '',
  categoryId: '',
  price: '',
}

function formatPrice(priceCents?: number) {
  if (priceCents === undefined) return 'Prix non renseigné'

  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(priceCents / 100)
}

export function ProductManager() {
  const categories = useLiveQuery(
    () => db.categories.orderBy('position').toArray(),
    [],
  )

  const products = useLiveQuery(
    () => db.products.toArray(),
    [],
  )

  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [variantProductId, setVariantProductId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const activeCategories = categories?.filter(
    (category) => category.active,
  ) ?? []

  const orderedProducts = [...(products ?? [])]
    .filter(product => !product.archived)
    .sort((a, b) => {
    const categoryA = categories?.findIndex(
      (category) => category.id === a.categoryId,
    ) ?? 0

    const categoryB = categories?.findIndex(
      (category) => category.id === b.categoryId,
    ) ?? 0

    return categoryA - categoryB || a.position - b.position
  })

  async function execute(action: () => Promise<void>) {
    if (busy) return

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      await action()
      setSuccess('Modification enregistrée.')
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Une erreur est survenue.',
      )
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    void execute(async () => {
      if (editingId) {
        await updateProduct(editingId, form)
      } else {
        await createProduct(form)
      }

      setForm(emptyForm)
      setEditingId(null)
    })
  }

  function edit(product: Product) {
    setEditingId(product.id)

    setForm({
      name: product.name,
      categoryId: product.categoryId,
      price:
        product.priceCents === undefined
          ? ''
          : (product.priceCents / 100).toFixed(2).replace('.', ','),
    })

    setError('')
    setSuccess('')
  }

  function archive(product: Product) {
    const confirmed = window.confirm(
      `Retirer définitivement « ${product.name} » du catalogue ? ` +
      'Le produit ne pourra plus être réactivé.'
    )

    if (!confirmed) return

    void execute(async () => {
      await archiveProduct(product.id)

      if (editingId === product.id) {
        setEditingId(null)
        setForm(emptyForm)
      }
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setSuccess('')
  }

  const variantProduct = products?.find(
    product => product.id === variantProductId,
  )

  if (variantProduct) {
    return (
      <VariantManager
        productId={variantProduct.id}
        productName={variantProduct.name}
        onClose={() => setVariantProductId(null)}
      />
    )
  }

  return (
    <section className="product-manager">
      <div className="section-heading">
        <span className="eyebrow">PARAMÈTRES</span>
        <h1>Gestion des produits</h1>
        <p>Produits enregistrés localement sur cet appareil.</p>
      </div>

      <form className="product-form" onSubmit={submit}>
        <h2>{editingId ? 'Modifier le produit' : 'Ajouter un produit'}</h2>

        <label htmlFor="product-name">Nom du produit</label>

        <input
          id="product-name"
          value={form.name}
          maxLength={120}
          required
          placeholder="Ex. Panini poulet"
          onChange={(event) =>
            setForm({ ...form, name: event.target.value })
          }
        />

        <label htmlFor="product-category">Catégorie</label>

        <select
          id="product-category"
          required
          value={form.categoryId}
          onChange={(event) =>
            setForm({ ...form, categoryId: event.target.value })
          }
        >
          <option value="">Choisir une catégorie</option>

          {activeCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <label htmlFor="product-price">Prix facultatif (€)</label>

        <input
          id="product-price"
          type="text"
          inputMode="decimal"
          placeholder="Ex. 6,50"
          value={form.price}
          onChange={(event) =>
            setForm({ ...form, price: event.target.value })
          }
        />

        <div className="product-form-actions">
          <button
            className="product-save"
            type="submit"
            disabled={
              busy ||
              !form.name.trim() ||
              !form.categoryId
            }
          >
            {editingId ? 'Enregistrer' : 'Ajouter le produit'}
          </button>

          {editingId && (
            <button type="button" onClick={cancelEdit}>
              Annuler
            </button>
          )}
        </div>
      </form>

      {error && <p role="alert" className="category-error">{error}</p>}

      {success && <p role="status" className="product-success">{success}</p>}

      <div className="products-heading">
        <h2>Produits enregistrés</h2>
        <span>{orderedProducts.length} produits</span>
      </div>

      {orderedProducts.length === 0 && (
        <div className="empty-catalogue">
          Aucun produit créé.
        </div>
      )}

      <div className="category-list">
        {orderedProducts.map((product) => {
          const category = categories?.find(
            (item) => item.id === product.categoryId,
          )

          const group = orderedProducts.filter(
            (item) => item.categoryId === product.categoryId,
          )

          const index = group.findIndex(
            (item) => item.id === product.id,
          )

          return (
            <div className="category-row" key={product.id}>
              <div className="product-row-info">
                <strong>{product.name}</strong>
                {!product.active && (
                  <span className="unavailable-label">
                    Masqué du catalogue
                  </span>
                )}
                <span>
                  {category?.name ?? 'Catégorie inconnue'}
                  {' · '}
                  {formatPrice(product.priceCents)}
                </span>
              </div>

              <div className="category-actions product-actions">
                <button
                  type="button"
                  className="archive-product-button"
                  disabled={busy}
                  aria-label={`Retirer définitivement ${product.name}`}
                  onClick={() => archive(product)}
                >
                  Retirer
                </button>

                <button
                  type="button"
                  className={
                    product.active
                      ? 'availability-button available'
                      : 'availability-button unavailable'
                  }
                  aria-label={
                    product.active
                      ? `Désactiver ${product.name}`
                      : `Activer ${product.name}`
                  }
                  disabled={busy}
                  onClick={() =>
                    void execute(() =>
                      setProductAvailability(
                        product.id,
                        !product.active,
                      ),
                    )
                  }
                >
                  {product.active ? 'Disponible' : 'Indisponible'}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setVariantProductId(product.id)}
                >
                  Variantes
                </button>

                <button
                  type="button"
                  aria-label={`Monter ${product.name}`}
                  disabled={busy || index === 0}
                  onClick={() =>
                    void execute(() => moveProduct(product.id, -1))
                  }
                >
                  ↑
                </button>

                <button
                  type="button"
                  aria-label={`Descendre ${product.name}`}
                  disabled={busy || index === group.length - 1}
                  onClick={() =>
                    void execute(() => moveProduct(product.id, 1))
                  }
                >
                  ↓
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => edit(product)}
                >
                  Modifier
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
