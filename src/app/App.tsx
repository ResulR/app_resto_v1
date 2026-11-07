import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '../shared/database/db'
import type {
  Category,
  Product,
} from '../shared/database/models'

import { CategoryManager } from '../features/catalogue/CategoryManager'
import { ProductManager } from '../features/catalogue/ProductManager'
import { OptionManager } from '../features/catalogue/OptionManager'
import {
  ProductCustomizer,
  type SelectedOption,
} from '../features/orders/ProductCustomizer'

import {
  addToCart,
  changeCartQuantity,
  editCartUnit,
  type CartItem,
} from '../features/orders/cart'

import './RestaurantLayout.css'

type Screen = 'orders' | 'settings'
type SettingsTab = 'categories' | 'products' | 'options'


function formatPrice(cents: number) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function OrderCatalogue({
  categories,
  products,
  onAdd,
}: {
  categories: Category[]
  products: Product[]
  onAdd: (product: Product) => void
}) {
  const [activeCategory, setActiveCategory] = useState('all')

  const visibleProducts = products.filter(
    product =>
      activeCategory === 'all' ||
      product.categoryId === activeCategory,
  )

  return (
    <section className="catalogue-panel">
      <div className="section-heading">
        <span className="eyebrow">ESPACE DE VENTE</span>
        <h1>Nouvelle commande</h1>
        <p>Sélectionnez les produits de la commande.</p>
      </div>

      <div className="categories" aria-label="Catégories">
        <button
          type="button"
          className={`category-button ${
            activeCategory === 'all' ? 'active' : ''
          }`}
          aria-pressed={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
        >
          Tout
        </button>

        {categories.map(category => (
          <button
            key={category.id}
            type="button"
            className={`category-button ${
              activeCategory === category.id ? 'active' : ''
            }`}
            aria-pressed={activeCategory === category.id}
            onClick={() => setActiveCategory(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="products-heading">
        <h2>
          {activeCategory === 'all'
            ? 'Tous les produits'
            : categories.find(
                category => category.id === activeCategory,
              )?.name}
        </h2>

        <span>{visibleProducts.length} produits</span>
      </div>

      {visibleProducts.length === 0 && (
        <div className="empty-catalogue">
          Aucun produit disponible dans cette catégorie.
        </div>
      )}

      <div className="products-grid">
        {visibleProducts.map(product => (
          <button
            key={product.id}
            className="product-card"
            type="button"
            aria-label={`Ajouter ${product.name}`}
            onClick={() => onAdd(product)}
          >
            <span className="product-name">
              {product.name}
            </span>

            {product.description && (
              <span className="product-description">
                {product.description}
              </span>
            )}

            <span className="product-bottom">
              <strong>
                {product.priceCents === undefined
                  ? 'Prix non renseigné'
                  : formatPrice(product.priceCents)}
              </strong>

              <span className="product-plus" aria-hidden="true">
                +
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function OrderSummary({
  items,
  comment,
  onCommentChange,
  onQuantityChange,
  onEdit,
}: {
  items: CartItem[]
  comment: string
  onCommentChange: (value: string) => void
  onQuantityChange: (id: string, delta: 1 | -1) => void
  onEdit: (item: CartItem) => void
}) {
  const knownTotal = items.reduce(
    (sum, item) =>
      sum +
      item.quantity * (
        (item.priceCents ?? 0) +
        item.options.reduce(
          (total, option) => total + (option.priceCents ?? 0),
          0,
        )
      ),
    0,
  )

  const hasUnknownPrices = items.some(
    item =>
      item.priceCents === undefined ||
      item.options.some(option => option.priceCents === undefined),
  )

  return (
    <aside
      className="order-panel"
      aria-label="Récapitulatif de commande"
    >
      <div className="order-header">
        <div>
          <span className="eyebrow">RÉCAPITULATIF</span>
          <h2>Commande</h2>
        </div>

        <span className="order-count">
          {items.reduce((sum, item) => sum + item.quantity, 0)} articles
        </span>
      </div>

      <p className="order-subtitle">
        Commande en préparation.
      </p>

      <div className="order-items">
        {items.length === 0 ? (
          <div className="empty-catalogue">
            Sélectionnez un produit pour commencer.
          </div>
        ) : (
          items.map(item => (
            <div className="order-item" key={item.id}>
              <div className="item-quantity">{item.quantity}×</div>

              <div className="item-details">
                <strong>{item.name}</strong>

                {item.options.map(option => (
                  <span key={option.id}>
                    {option.groupName} : {option.name}
                  </span>
                ))}

                {item.note && (
                  <span className="order-item-note">
                    Note : {item.note}
                  </span>
                )}

                <div className="cart-item-actions">
                  <button
                    type="button"
                    aria-label={`Retirer une unité de ${item.name}`}
                    onClick={() => onQuantityChange(item.id, -1)}
                  >
                    −
                  </button>

                  <span>{item.quantity}</span>

                  <button
                    type="button"
                    aria-label={`Ajouter une unité de ${item.name}`}
                    onClick={() => onQuantityChange(item.id, 1)}
                  >
                    +
                  </button>

                  <button
                    type="button"
                    className="cart-edit-button"
                    onClick={() => onEdit(item)}
                  >
                    Modifier
                  </button>
                </div>
              </div>

              <strong className="item-price">
                {item.priceCents === undefined ||
                  item.options.some(option => option.priceCents === undefined)
                  ? '—'
                  : formatPrice(
                      item.quantity * (
                        item.priceCents +
                        item.options.reduce(
                          (total, option) =>
                            total + (option.priceCents ?? 0),
                          0,
                        )
                      ),
                    )}
              </strong>
            </div>
          ))
        )}
      </div>

      <div className="order-footer">
        <div className="order-comment-field">
          <label htmlFor="order-comment">
            Commentaire général (facultatif)
          </label>

          <textarea
            id="order-comment"
            rows={3}
            maxLength={2000}
            value={comment}
            placeholder="Instructions pour toute la commande..."
            onChange={event => onCommentChange(event.target.value)}
          />
        </div>

        {items.length > 0 && (
          <>
            <div className="total-row">
              <span>
                {hasUnknownPrices
                  ? 'Sous-total des prix connus'
                  : 'Total'}
              </span>

              <strong>{formatPrice(knownTotal)}</strong>
            </div>

            {hasUnknownPrices && (
              <p className="order-price-warning">
                Total incomplet : certains articles
                n'ont pas de prix renseigné.
              </p>
            )}
          </>
        )}

        <button
          className="finish-button"
          type="button"
          disabled
        >
          Terminer la commande
          <span>→</span>
        </button>

        <p className="demo-note">
          Brouillon temporaire — aucune commande validée.
        </p>
      </div>
    </aside>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('orders')

  const [settingsTab, setSettingsTab] =
    useState<SettingsTab>('categories')

  const [items, setItems] = useState<CartItem[]>([])
  const [comment, setComment] = useState('')
  const [customizing, setCustomizing] = useState<Product | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [orderError, setOrderError] = useState('')

  const categories = useLiveQuery(
    () => db.categories.orderBy('position').toArray(),
    [],
  )

  const products = useLiveQuery(
    () => db.products.toArray(),
    [],
  )

  const activeCategories = (categories ?? [])
    .filter(category => category.active)

  const activeCategoryIds = new Set(
    activeCategories.map(category => category.id),
  )

  const activeProducts = (products ?? [])
    .filter(
      product =>
        product.active &&
        !product.archived &&
        activeCategoryIds.has(product.categoryId),
    )
    .sort((a, b) => a.position - b.position)

  function appendProduct(
    product: Product,
    options: SelectedOption[] = [],
    note = '',
  ) {
    setItems(current => addToCart(current, product, options, note))
  }

  function changeQuantity(id: string, delta: 1 | -1) {
    setItems(current => changeCartQuantity(current, id, delta))
  }

  function editItem(item: CartItem) {
    setEditingItemId(item.id)
    setCustomizing({
      id: item.productId,
      categoryId: '',
      name: item.name,
      priceCents: item.priceCents,
      position: 0,
      active: true,
    })
  }

  async function addProduct(product: Product) {
    setOrderError('')

    try {
      const currentProduct = await db.products.get(product.id)

      if (!currentProduct?.active || currentProduct.archived) {
        throw new Error('Ce produit est indisponible ou retiré.')
      }

      setEditingItemId(null)
      setCustomizing(currentProduct)
    } catch (cause) {
      setOrderError(
        cause instanceof Error
          ? cause.message
          : 'Impossible d’ajouter ce produit.',
      )
    }
  }

  return (
    <div className="restaurant-app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">R</div>

          <div>
            <strong>Restaurant</strong>
            <span>Prise de commandes</span>
          </div>
        </div>

        <div className="topbar-right">
          <button
            className="screen-button"
            type="button"
            onClick={() =>
              setScreen(
                screen === 'orders' ? 'settings' : 'orders',
              )
            }
          >
            {screen === 'orders'
              ? 'Paramètres'
              : 'Retour aux commandes'}
          </button>

          <div className="avatar">A</div>
        </div>
      </header>

      {screen === 'settings' ? (
        <div className="settings-workspace">
          <nav
            className="settings-tabs"
            aria-label="Paramètres du catalogue"
          >
            <button
              type="button"
              className={
                settingsTab === 'categories' ? 'active' : ''
              }
              onClick={() => setSettingsTab('categories')}
            >
              Catégories
            </button>

            <button
              type="button"
              className={
                settingsTab === 'products' ? 'active' : ''
              }
              onClick={() => setSettingsTab('products')}
            >
              Produits
            </button>

            <button
              type="button"
              className={
                settingsTab === 'options' ? 'active' : ''
              }
              onClick={() => setSettingsTab('options')}
            >
              Options
            </button>
          </nav>

          {settingsTab === 'categories' ? (
            <CategoryManager />
          ) : settingsTab === 'products' ? (
            <ProductManager />
          ) : (
            <OptionManager />
          )}
        </div>
      ) : (
        <div className="workspace">
          {categories === undefined || products === undefined ? (
            <section className="catalogue-panel">
              <p role="status">Chargement du catalogue...</p>
            </section>
          ) : (
            <OrderCatalogue
              categories={activeCategories}
              products={activeProducts}
              onAdd={addProduct}
            />
          )}

          <OrderSummary
            items={items}
            comment={comment}
            onCommentChange={setComment}
            onQuantityChange={changeQuantity}
            onEdit={editItem}
          />
        </div>
      )}

      {orderError && (
        <p className="order-action-error" role="alert">
          {orderError}
        </p>
      )}

      {customizing && (
        <ProductCustomizer
          key={editingItemId ?? customizing.id}
          product={customizing}
          initialOptions={
            items.find(item => item.id === editingItemId)?.options
          }
          initialNote={
            items.find(item => item.id === editingItemId)?.note
          }
          onCancel={() => {
            setCustomizing(null)
            setEditingItemId(null)
          }}
          onConfirm={(product, options, note) => {
            if (editingItemId) {
              setItems(current =>
                editCartUnit(
                  current,
                  editingItemId,
                  product,
                  options,
                  note,
                ),
              )
            } else {
              appendProduct(product, options, note)
            }

            setCustomizing(null)
            setEditingItemId(null)
          }}
        />
      )}
    </div>
  )
}
