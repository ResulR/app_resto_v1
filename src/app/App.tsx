import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import type { Product } from '../shared/database/models'
import { listCategories } from '../features/catalogue/categoryRepository'
import {
  listAllProducts,
  getProductById,
} from '../features/catalogue/productRepository'

import { CategoryManager } from '../features/catalogue/CategoryManager'
import { ProductManager } from '../features/catalogue/ProductManager'
import { OptionManager } from '../features/catalogue/OptionManager'
import { PrinterSettings } from '../features/printing/PrinterSettings'
import { AdminAccount } from '../features/auth/AdminAccount'
import { StatisticsPanel } from '../features/statistics/StatisticsPanel'
import {
  ProductCustomizer,
  type SelectedOption,
} from '../features/orders/ProductCustomizer'

import {
  addToCart,
  addFreeItem,
  changeCartQuantity,
  editCartUnit,
  type CartItem,
  type FreeItemInput,
  type SelectedVariant,
} from '../features/orders/cart'
import { FreeItemForm } from '../features/orders/FreeItemForm'
import { DraftManager } from '../features/orders/DraftManager'
import { ActiveOrders } from '../features/orders/ActiveOrders'
import { CashRegister } from '../features/checkout/CashRegister'
import { CompletedOrders } from '../features/orders/CompletedOrders'
import {
  saveDraft,
  deleteDraft,
  type OrderDraft,
} from '../features/orders/draftRepository'
import {
  confirmOrRecoverOrder,
  getLatestConfirmedOrder,
  type ConfirmedOrder,
  type ConsumptionMode,
} from '../features/orders/orderRepository'

import { OrderCatalogue } from '../features/orders/OrderCatalogue'
import { OrderSummary } from '../features/orders/OrderSummary'

import {
  HomeDashboard,
  type HomeDestination,
} from './HomeDashboard'

import './RestaurantLayout.css'

type Screen =
  | 'home'
  | 'orders'
  | 'checkout'
  | 'active'
  | 'history'
  | 'statistics'
  | 'catalogue'
  | 'settings'
type SettingsTab = 'categories' | 'products' | 'options' | 'printing' | 'stats' | 'account'


function formatPrice(cents: number) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')

  const [settingsTab, setSettingsTab] =
    useState<SettingsTab>('categories')

  const [items, setItems] = useState<CartItem[]>([])
  const [saving, setSaving] = useState(false)
  const [activeDraftId, setActiveDraftId] =
    useState<string | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [confirmedOrder, setConfirmedOrder] =
    useState<ConfirmedOrder | null>(null)
  const validationLock = useRef(false)
  const pendingOrderId = useRef<string | null>(null)

  const latestConfirmedOrder = useLiveQuery(
    () => getLatestConfirmedOrder(),
    [],
  )
  const [comment, setComment] = useState('')
  const [consumptionMode, setConsumptionMode] =
    useState<ConsumptionMode>(null)
  const [customizing, setCustomizing] = useState<Product | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [freeItemOpen, setFreeItemOpen] = useState(false)
  const [orderError, setOrderError] = useState('')

  const categories = useLiveQuery(
    () => listCategories(),
    [],
  )

  const products = useLiveQuery(
    () => listAllProducts(),
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
    variant?: SelectedVariant,
  ) {
    setItems(current =>
      addToCart(current, product, options, note, variant),
    )
  }

  function appendFreeItem(input: FreeItemInput) {
    // Validation synchrone avant de fermer le formulaire.
    setItems(current => addFreeItem(current, input))
    setFreeItemOpen(false)
  }

  async function holdOrder() {
    if (
      draftBusy ||
      saving ||
      validationLock.current ||
      (items.length === 0 && !comment.trim())
    ) return

    setDraftBusy(true)
    setDraftError('')

    try {
      const id = activeDraftId ?? crypto.randomUUID()

      await saveDraft({
        id,
        items,
        comment,
        consumptionMode,
      })

      setItems([])
      setComment('')
      setConsumptionMode(null)
      setActiveDraftId(null)
      pendingOrderId.current = null
    } catch (cause) {
      setDraftError(
        cause instanceof Error
          ? cause.message
          : 'Impossible de mettre la commande en attente.',
      )
    } finally {
      setDraftBusy(false)
    }
  }

  function resumeDraft(draft: OrderDraft) {
    if (
      saving ||
      draftBusy ||
      validationLock.current
    ) return

    if (items.length > 0 || comment.trim()) {
      setDraftError(
        'Mettez d’abord la commande actuelle en attente.',
      )
      return
    }

    setItems(structuredClone(draft.items))
    setComment(draft.comment)
    setConsumptionMode(draft.consumptionMode)
    setActiveDraftId(draft.id)
    pendingOrderId.current = null
    setDraftError('')
  }

  async function finishOrder() {
    // Verrou synchrone : protège contre les doubles clics.
    if (validationLock.current || items.length === 0) return

    validationLock.current = true
    setSaving(true)
    setOrderError('')

    const id = pendingOrderId.current ?? crypto.randomUUID()
    pendingOrderId.current = id

    try {
      const saved = await confirmOrRecoverOrder({
        id,
        items,
        comment,
        consumptionMode,
      })

      setConfirmedOrder(saved)
      setItems([])
      setComment('')
      setConsumptionMode(null)
      pendingOrderId.current = null

      if (activeDraftId) {
        try {
          await deleteDraft(activeDraftId)
        } catch {
          // La commande validée est sauvegardée.
          // Un nettoyage ultérieur pourra retirer ce brouillon.
        }
      }

      setActiveDraftId(null)
    } catch (cause) {
      setOrderError(
        'Commande non enregistrée. Vérifiez le stockage ' +
        'de cet appareil puis réessayez. Détail : ' +
        (cause instanceof Error
          ? cause.message
          : 'Erreur de stockage inconnue.'),
      )
    } finally {
      validationLock.current = false
      setSaving(false)
    }
  }

  function changeQuantity(id: string, delta: 1 | -1) {
    setItems(current => changeCartQuantity(current, id, delta))
  }

  async function editItem(item: CartItem) {
    setOrderError('')

    try {
      const original = await getProductById(item.productId)

      if (!original?.active || original.archived) {
        throw new Error(
          'Produit retiré ou indisponible : modification impossible.',
        )
      }

      setEditingItemId(item.id)
      setCustomizing(original)
    } catch (cause) {
      setOrderError(
        cause instanceof Error
          ? cause.message
          : 'Modification impossible.',
      )
    }
  }

  async function addProduct(product: Product) {
    setOrderError('')

    try {
      const currentProduct = await getProductById(product.id)

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

  function navigateFromHome(destination: HomeDestination) {
    if (destination === 'catalogue') {
      setSettingsTab('categories')
      setScreen('catalogue')
      return
    }

    if (destination === 'settings') {
      setSettingsTab('account')
      setScreen('settings')
      return
    }

    setScreen(destination)
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
            disabled={screen === 'home'}
            onClick={() => setScreen('home')}
          >
            Accueil
          </button>

          <div className="avatar">A</div>
        </div>
      </header>

      {screen === 'home' ? (
        <HomeDashboard onNavigate={navigateFromHome} />
      ) : screen === 'checkout' ? (
        <main className="section-workspace">
          <CashRegister />
        </main>
      ) : screen === 'active' ? (
        <main className="section-workspace">
          <ActiveOrders showCashRegister={false} />
        </main>
      ) : screen === 'history' ? (
        <main className="section-workspace">
          <CompletedOrders />
        </main>
      ) : screen === 'statistics' ? (
        <main className="section-workspace">
          <StatisticsPanel />
        </main>
      ) : screen === 'settings' || screen === 'catalogue' ? (
        <div className="settings-workspace">
          <nav
            className="settings-tabs"
            aria-label={
              screen === 'catalogue'
                ? 'Gestion du catalogue'
                : 'Paramètres du restaurant'
            }
          >
            {screen === 'catalogue' && (
            <button
              type="button"
              className={
                settingsTab === 'categories' ? 'active' : ''
              }
              onClick={() => setSettingsTab('categories')}
            >
              Catégories
            </button>
            )}

            {screen === 'catalogue' && (
            <button
              type="button"
              className={
                settingsTab === 'products' ? 'active' : ''
              }
              onClick={() => setSettingsTab('products')}
            >
              Produits
            </button>
            )}

            {screen === 'catalogue' && (
            <button
              type="button"
              className={
                settingsTab === 'options' ? 'active' : ''
              }
              onClick={() => setSettingsTab('options')}
            >
              Options
            </button>
            )}

            {screen === 'settings' && (
            <button
              type="button"
              className={
                settingsTab === 'printing' ? 'active' : ''
              }
              onClick={() => setSettingsTab('printing')}
            >
              Impression
            </button>
            )}



            {screen === 'settings' && (
            <button
              type="button"
              className={
                settingsTab === 'account' ? 'active' : ''
              }
              onClick={() => setSettingsTab('account')}
            >
              Compte
            </button>
            )}
          </nav>

          {settingsTab === 'categories' ? (
            <CategoryManager />
          ) : settingsTab === 'products' ? (
            <ProductManager />
          ) : settingsTab === 'options' ? (
            <OptionManager />
          ) : settingsTab === 'printing' ? (
            <PrinterSettings />
          ) : settingsTab === 'stats' ? (
            <StatisticsPanel />
          ) : (
            <AdminAccount />
          )}
        </div>
      ) : (
        <div className="workspace">
          <div className="order-main-column">
            <nav
              className="service-shortcuts"
              aria-label="Navigation rapide du restaurant"
            >
              {[
                { label: 'Produits', screen: 'orders' },
                { label: 'Commandes actives', screen: 'active' },
                { label: 'Caisse', screen: 'checkout' },
                { label: 'Historique', screen: 'history' },
              ].map(shortcut => (
                <button
                  key={shortcut.screen}
                  type="button"
                  onClick={() =>
                    setScreen(shortcut.screen as Screen)
                  }
                >
                  {shortcut.label}
                </button>
              ))}
            </nav>
          {categories === undefined || products === undefined ? (
            <section className="catalogue-panel">
              <p role="status">Chargement du catalogue...</p>
            </section>
          ) : (
            <OrderCatalogue
              categories={activeCategories}
              products={activeProducts}
              onAdd={addProduct}
              onAddFree={() => setFreeItemOpen(true)}
            />
          )}

          <div className="draft-workspace">
            <div className="draft-toolbar">
              <button
                type="button"
                className="draft-hold-button"
                disabled={
                  draftBusy ||
                  saving ||
                  (items.length === 0 && !comment.trim())
                }
                onClick={() => void holdOrder()}
              >
                {draftBusy
                  ? 'Enregistrement...'
                  : 'Mettre en attente'}
              </button>
            </div>

            {draftError && (
              <p className="category-error" role="alert">
                {draftError}
              </p>
            )}

            <DraftManager
              activeDraftId={activeDraftId}
              onResume={resumeDraft}
            />
          </div>

          </div>

          <OrderSummary
            items={items}
            comment={comment}
            onCommentChange={setComment}
            consumptionMode={consumptionMode}
            onConsumptionModeChange={setConsumptionMode}
            onQuantityChange={changeQuantity}
            onEdit={editItem}
            onFinish={() => void finishOrder()}
            saving={saving}
          />
        </div>
      )}

      {orderError && (
        <p className="order-action-error" role="alert">
          {orderError}
        </p>
      )}

      {confirmedOrder && (
        <div className="customizer-overlay">
          <section
            className="customizer-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmed-title"
          >
            <span className="eyebrow">COMMANDE VALIDÉE</span>
            <h2 id="confirmed-title">
              Commande enregistrée
            </h2>

            <p className="confirmed-order-id">
              N° {confirmedOrder.id.toUpperCase()}
            </p>

            <p>
              Enregistrée le{' '}
              {new Date(confirmedOrder.createdAt)
                .toLocaleString('fr-BE')}.
            </p>

            <div className="confirmed-order-items">
              {confirmedOrder.items.map(item => (
                <div key={item.id} className="confirmed-order-line">
                  <strong>{item.quantity} × {item.name}</strong>

                  {item.options.map(option => (
                    <span key={option.id}>
                      {option.groupName} : {option.name}
                    </span>
                  ))}

                  {item.note && <span>Note : {item.note}</span>}
                </div>
              ))}
            </div>

            {confirmedOrder.comment && (
              <p>Commentaire : {confirmedOrder.comment}</p>
            )}

            <p>
              Mode : {
                confirmedOrder.consumptionMode === 'sur_place'
                  ? 'Sur place'
                  : confirmedOrder.consumptionMode === 'emporter'
                    ? 'À emporter'
                    : 'Non précisé'
              }
            </p>

            <p>
              {confirmedOrder.totalComplete
                ? 'Total'
                : 'Montant connu'} :{' '}
              {formatPrice(confirmedOrder.knownTotalCents)}
            </p>

            <p className="variant-description">
              Commande définitive : aucune modification
              ni annulation possible.
            </p>

            <button
              className="customizer-confirm"
              type="button"
              onClick={() => setConfirmedOrder(null)}
            >
              Nouvelle commande
            </button>
          </section>
        </div>
      )}

      {!confirmedOrder && latestConfirmedOrder && (
        <button
          type="button"
          className="last-order-button"
          onClick={() => setConfirmedOrder(latestConfirmedOrder)}
        >
          Voir la dernière commande validée
        </button>
      )}

      {freeItemOpen && (
        <FreeItemForm
          onCancel={() => setFreeItemOpen(false)}
          onConfirm={appendFreeItem}
        />
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
          initialVariant={
            items.find(item => item.id === editingItemId)?.variant
          }
          onCancel={() => {
            setCustomizing(null)
            setEditingItemId(null)
          }}
          onConfirm={(product, options, note, variant) => {
            if (editingItemId) {
              setItems(current =>
                editCartUnit(
                  current,
                  editingItemId,
                  product,
                  options,
                  note,
                  variant,
                ),
              )
            } else {
              appendProduct(product, options, note, variant)
            }

            setCustomizing(null)
            setEditingItemId(null)
          }}
        />
      )}
    </div>
  )
}
