import { useState } from 'react'
import type { Category, Product } from '../../shared/database/models'

function formatPrice(cents: number) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function OrderCatalogue({
  categories,
  products,
  onAdd,
  onAddFree,
}: {
  categories: Category[]
  products: Product[]
  onAdd: (product: Product) => void
  onAddFree: () => void
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

      <div className="free-item-toolbar">
        <button
          type="button"
          className="free-item-open"
          onClick={onAddFree}
        >
          + Produit libre
        </button>
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
