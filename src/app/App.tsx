import { useState } from 'react'

import './RestaurantLayout.css'

type Product = {
  id: number
  name: string
  price?: number
  category: string
  description: string
  emoji: string
}

const categories = [
  { id: 'all', name: 'Tout', emoji: '🍽️' },
  { id: 'paninis', name: 'Paninis', emoji: '🥪' },
  { id: 'pates', name: 'Pâtes', emoji: '🍝' },
  { id: 'boissons', name: 'Boissons', emoji: '🥤' },
  { id: 'desserts', name: 'Desserts', emoji: '🍰' },
]

const products: Product[] = [
  {
    id: 1,
    name: 'Panini Poulet',
    price: 6.5,
    category: 'paninis',
    description: 'Poulet, fromage',
    emoji: '🥪',
  },
  {
    id: 2,
    name: 'Panini Kebab',
    price: 7,
    category: 'paninis',
    description: 'Kebab, fromage',
    emoji: '🥙',
  },
  {
    id: 3,
    name: 'Panini Fromage',
    price: 5,
    category: 'paninis',
    description: 'Fromage fondant',
    emoji: '🧀',
  },
  {
    id: 4,
    name: 'Pâtes Bolognaise',
    price: 9,
    category: 'pates',
    description: 'Sauce bolognaise',
    emoji: '🍝',
  },
  {
    id: 5,
    name: 'Pâtes Carbonara',
    price: 9.5,
    category: 'pates',
    description: 'Sauce carbonara',
    emoji: '🍝',
  },
  {
    id: 6,
    name: 'Coca-Cola',
    price: 2.5,
    category: 'boissons',
    description: '33 cl',
    emoji: '🥤',
  },
  {
    id: 7,
    name: 'Eau',
    price: 2,
    category: 'boissons',
    description: '50 cl',
    emoji: '💧',
  },
  {
    id: 8,
    name: 'Dessert du jour',
    category: 'desserts',
    description: 'Prix non renseigné',
    emoji: '🍰',
  },
]

const demoItems = [
  { id: 1, name: 'Panini Poulet', detail: 'Sans tomate', quantity: 2, price: 6.5 },
  { id: 2, name: 'Coca-Cola', detail: '33 cl', quantity: 1, price: 2.5 },
]

function formatPrice(price: number) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(price)
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null)

  const visibleProducts = products.filter(
    (product) => activeCategory === 'all' || product.category === activeCategory,
  )

  const demoTotal = demoItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
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
          <span className="demo-badge">Mode démonstration</span>
          <div className="avatar">A</div>
        </div>
      </header>

      <div className="workspace">
        <section className="catalogue-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ESPACE DE VENTE</span>
              <h1>Nouvelle commande</h1>
              <p>Sélectionnez une catégorie pour afficher ses produits.</p>
            </div>
          </div>

          <div className="categories" aria-label="Catégories">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={activeCategory === category.id}
                className={`category-button ${
                  activeCategory === category.id ? 'active' : ''
                }`}
                onClick={() => {
                  setActiveCategory(category.id)
                  setSelectedProduct(null)
                }}
              >
                <span>{category.emoji}</span>
                {category.name}
              </button>
            ))}
          </div>

          <div className="products-heading">
            <h2>
              {categories.find((category) => category.id === activeCategory)?.name}
            </h2>
            <span>{visibleProducts.length} produits</span>
          </div>

          <div className="products-grid">
            {visibleProducts.map((product) => (
              <button
                type="button"
                key={product.id}
                aria-pressed={selectedProduct === product.id}
                className={`product-card ${
                  selectedProduct === product.id ? 'selected' : ''
                }`}
                onClick={() => setSelectedProduct(product.id)}
              >
                <span className="product-emoji">{product.emoji}</span>
                <span className="product-name">{product.name}</span>
                <span className="product-description">{product.description}</span>

                <span className="product-bottom">
                  <strong>
                    {product.price === undefined
                      ? 'Prix non renseigné'
                      : formatPrice(product.price)}
                  </strong>
                  <span className="product-plus" aria-hidden="true">
                    +
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="catalogue-info" role="status">
            {selectedProduct === null
              ? 'Sélectionnez un produit pour le prévisualiser.'
              : `Produit sélectionné : ${
                  products.find((product) => product.id === selectedProduct)?.name
                }. L’ajout aux commandes sera disponible prochainement.`}
          </div>
        </section>

        <aside className="order-panel" aria-label="Récapitulatif de commande">
          <div className="order-header">
            <div>
              <span className="eyebrow">RÉCAPITULATIF</span>
              <h2>Commande</h2>
            </div>
            <span className="order-demo">Exemple</span>
          </div>

          <p className="order-subtitle">
            Aperçu avec des articles temporaires.
          </p>

          <div className="order-items">
            {demoItems.map((item) => (
              <div className="order-item" key={item.id}>
                <div className="item-quantity">{item.quantity}×</div>
                <div className="item-details">
                  <strong>{item.name}</strong>
                  <span>{item.detail}</span>
                </div>
                <strong className="item-price">
                  {formatPrice(item.price * item.quantity)}
                </strong>
              </div>
            ))}
          </div>

          <div className="order-footer">
            <div className="total-row">
              <span>Total de l'exemple</span>
              <strong>{formatPrice(demoTotal)}</strong>
            </div>

            <button className="finish-button" type="button" disabled>
              Terminer la commande
              <span>→</span>
            </button>

            <p className="demo-note">
              Prévisualisation uniquement — aucune commande enregistrée.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
