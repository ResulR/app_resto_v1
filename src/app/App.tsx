import { useEffect, useState } from 'react'
import { CategoryManager } from '../features/catalogue/CategoryManager'
import { ProductManager } from '../features/catalogue/ProductManager'
import { OptionManager } from '../features/catalogue/OptionManager'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../shared/database/db'

import { getCatalogue } from '../features/catalogue/catalogueRepository'
import type {
  Category,
  Product,
} from '../shared/database/models'

import './RestaurantLayout.css'

function formatPrice(cents: number) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export default function App() {
  const [screen, setScreen] = useState<'orders' | 'settings'>('orders')
  const [settingsTab, setSettingsTab] = useState<'categories' | 'products' | 'options'>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    getCatalogue()
      .then((data) => {
        if (cancelled) return

        setCategories(data.categories)
        setProducts(data.products)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return

        setError(true)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const liveCategories = useLiveQuery(
    () => db.categories.orderBy('position').toArray(),
    [],
  )

  const displayedCategories = liveCategories?.filter(
    (category) => category.active,
  ) ?? categories

  const liveProducts = useLiveQuery(
    () => db.products.orderBy('position').toArray(),
    [],
  )

  const activeCategoryIds = new Set(
    displayedCategories.map((category) => category.id),
  )

  const displayedProducts = (liveProducts ?? products).filter(
    (product) =>
      product.active &&
      activeCategoryIds.has(product.categoryId),
  )

  const visibleProducts = displayedProducts.filter(
    (product) =>
      activeCategory === 'all' ||
      product.categoryId === activeCategory,
  )

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
            onClick={() => setScreen(screen === 'orders' ? 'settings' : 'orders')}
          >
            {screen === 'orders' ? 'Paramètres' : 'Retour aux commandes'}
          </button>
          <div className="avatar">A</div>
        </div>
      </header>

      {screen === 'settings' ? (
        <div className="settings-workspace">
          <nav className="settings-tabs" aria-label="Paramètres du catalogue">
            <button
              type="button"
              className={settingsTab === 'categories' ? 'active' : ''}
              onClick={() => setSettingsTab('categories')}
            >
              Catégories
            </button>

            <button
              type="button"
              className={settingsTab === 'products' ? 'active' : ''}
              onClick={() => setSettingsTab('products')}
            >
              Produits
            </button>
            <button
              type="button"
              className={settingsTab === 'options' ? 'active' : ''}
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
        <section className="catalogue-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ESPACE DE VENTE</span>
              <h1>Nouvelle commande</h1>
              <p>Sélectionnez une catégorie pour afficher ses produits.</p>
            </div>
          </div>

          {loading && (
            <p role="status">Chargement du catalogue...</p>
          )}

          {error && (
            <p role="alert">
              Impossible d'ouvrir la base de données locale.
            </p>
          )}

          {!loading && !error && (
            <>
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

                {displayedCategories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
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
                    : displayedCategories.find(
                        (category) => category.id === activeCategory,
                      )?.name}
                </h2>

                <span>{visibleProducts.length} produits</span>
              </div>

              {visibleProducts.length === 0 && (
                <div className="empty-catalogue">
                  Aucun produit disponible.
                  <p>
                    Le catalogue pourra être configuré
                    depuis les paramètres.
                  </p>
                </div>
              )}

              <div className="products-grid">
                {visibleProducts.map((product) => (
                  <div className="product-card" key={product.id}>
                    <span className="product-name">
                      {product.name}
                    </span>

                    {product.description && (
                      <span className="product-description">
                        {product.description}
                      </span>
                    )}

                    {product.priceCents !== undefined && (
                      <span className="product-bottom">
                        <strong>
                          {formatPrice(product.priceCents)}
                        </strong>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <aside
          className="order-panel"
          aria-label="Récapitulatif de commande"
        >
          <div className="order-header">
            <div>
              <span className="eyebrow">RÉCAPITULATIF</span>
              <h2>Commande</h2>
            </div>
          </div>

          <p className="order-subtitle">
            Aucune commande en cours.
          </p>

          <div className="order-items">
            <div className="empty-catalogue">
              Les articles apparaîtront ici.
            </div>
          </div>

          <div className="order-footer">
            <button
              className="finish-button"
              type="button"
              disabled
            >
              Terminer la commande
            </button>
          </div>
        </aside>
      </div>
      )}
    </div>
  )
}
