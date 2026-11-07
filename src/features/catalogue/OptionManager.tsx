import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../shared/database/db'
import { setOptionAvailability } from './availabilityRepository'
import {
  createOptionGroup,
  renameOptionGroup,
  createOption,
  updateOption,
  deleteOption,
  setProductOptionGroup,
} from './optionRepository'

function priceLabel(cents?: number) {
  if (cents === undefined) return 'Sans prix'

  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function OptionManager() {
  const groups = useLiveQuery(
    () => db.optionGroups.orderBy('position').toArray(),
    [],
  )
  const options = useLiveQuery(
    () => db.options.toArray(),
    [],
  )
  const products = useLiveQuery(
    () => db.products.toArray(),
    [],
  )
  const links = useLiveQuery(
    () => db.productOptionGroups.toArray(),
    [],
  )

  const [groupName, setGroupName] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [optionName, setOptionName] = useState('')
  const [optionPrice, setOptionPrice] = useState('')
  const [editingOption, setEditingOption] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const currentGroup = groups?.find(g => g.id === selectedGroup)

  const currentOptions = (options ?? [])
    .filter(o => o.groupId === selectedGroup)
    .sort((a, b) => a.position - b.position)

  const sortedProducts = [...(products ?? [])]
    .filter(p => p.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  async function execute(action: () => Promise<unknown>) {
    if (busy) return

    setBusy(true)
    setError('')
    setMessage('')

    try {
      await action()
      setMessage('Modifications enregistrées.')
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

  function addGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    void execute(async () => {
      await createOptionGroup(groupName)
      setGroupName('')
    })
  }

  function renameGroup() {
    if (!currentGroup) return

    const name = window.prompt(
      'Nouveau nom du groupe',
      currentGroup.name,
    )

    if (name === null) return

    void execute(() => renameOptionGroup(currentGroup.id, name))
  }

  function submitOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedGroup) return

    void execute(async () => {
      if (editingOption) {
        await updateOption(editingOption, optionName, optionPrice)
      } else {
        await createOption(selectedGroup, optionName, optionPrice)
      }

      setEditingOption(null)
      setOptionName('')
      setOptionPrice('')
    })
  }

  function editOption(id: string) {
    const option = currentOptions.find(o => o.id === id)

    if (!option) return

    setEditingOption(id)
    setOptionName(option.name)
    setOptionPrice(
      option.priceCents === undefined
        ? ''
        : (option.priceCents / 100).toFixed(2).replace('.', ','),
    )
  }

  function resetOptionForm() {
    setEditingOption(null)
    setOptionName('')
    setOptionPrice('')
  }

  function removeOption(id: string, name: string) {
    if (!window.confirm(`Supprimer « ${name} » ?`)) return

    void execute(async () => {
      await deleteOption(id)

      if (editingOption === id) {
        resetOptionForm()
      }
    })
  }

  return (
    <section className="option-manager">
      <div className="section-heading">
        <span className="eyebrow">PARAMÈTRES</span>
        <h1>Groupes d'options</h1>
        <p>
          Créez des groupes réutilisables : salades, sauces,
          suppléments ou autres.
        </p>
      </div>

      <form className="product-form" onSubmit={addGroup}>
        <h2>Créer un groupe</h2>

        <label htmlFor="group-name">Nom du groupe</label>
        <input
          id="group-name"
          value={groupName}
          maxLength={80}
          required
          placeholder="Ex. Salades"
          onChange={event => setGroupName(event.target.value)}
        />

        <div className="product-form-actions">
          <button
            className="product-save"
            type="submit"
            disabled={busy || !groupName.trim()}
          >
            Ajouter le groupe
          </button>
        </div>
      </form>

      <div className="product-form">
        <h2>Gérer un groupe</h2>

        <label htmlFor="group-select">Groupe</label>
        <select
          id="group-select"
          value={selectedGroup}
          onChange={event => {
            setSelectedGroup(event.target.value)
            resetOptionForm()
            setError('')
            setMessage('')
          }}
        >
          <option value="">Choisir un groupe</option>
          {groups?.map(group => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>

        {currentGroup && (
          <div className="product-form-actions">
            <button
              type="button"
              disabled={busy}
              onClick={renameGroup}
            >
              Renommer le groupe
            </button>
          </div>
        )}
      </div>

      {currentGroup && (
        <>
          <form className="product-form" onSubmit={submitOption}>
            <h2>
              {editingOption ? 'Modifier une option' : 'Ajouter une option'}
            </h2>

            <label htmlFor="option-name">Nom</label>
            <input
              id="option-name"
              value={optionName}
              maxLength={80}
              required
              placeholder="Ex. Tomate"
              onChange={event => setOptionName(event.target.value)}
            />

            <label htmlFor="option-price">Prix facultatif (€)</label>
            <input
              id="option-price"
              value={optionPrice}
              inputMode="decimal"
              placeholder="Ex. 0,50"
              onChange={event => setOptionPrice(event.target.value)}
            />

            <div className="product-form-actions">
              <button
                className="product-save"
                type="submit"
                disabled={busy || !optionName.trim()}
              >
                {editingOption ? 'Enregistrer' : 'Ajouter l’option'}
              </button>

              {editingOption && (
                <button type="button" onClick={resetOptionForm}>
                  Annuler
                </button>
              )}
            </div>
          </form>

          <h2>Options du groupe</h2>

          {currentOptions.length === 0 && (
            <div className="empty-catalogue">
              Aucune option enregistrée.
            </div>
          )}

          <div className="category-list">
            {currentOptions.map(option => (
              <div className="category-row" key={option.id}>
                <div className="product-row-info">
                  <strong>{option.name}</strong>
                  <span>{priceLabel(option.priceCents)}</span>
                  {!option.active && (
                    <span className="unavailable-label">
                      Exclue des sélections
                    </span>
                  )}
                </div>

                <div className="category-actions">
                  <button
                    type="button"
                    className={
                      option.active
                        ? 'availability-button available'
                        : 'availability-button unavailable'
                    }
                    disabled={busy}
                    aria-label={
                      option.active
                        ? `Désactiver ${option.name}`
                        : `Activer ${option.name}`
                    }
                    onClick={() =>
                      void execute(() =>
                        setOptionAvailability(
                          option.id,
                          !option.active,
                        ),
                      )
                    }
                  >
                    {option.active ? 'Disponible' : 'Indisponible'}
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => editOption(option.id)}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeOption(option.id, option.name)}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="product-form">
            <h2>Produits utilisant ce groupe</h2>
            <p className="variant-description">
              Un même groupe peut être associé à plusieurs produits.
              Aucune option n'est obligatoire.
            </p>

            {sortedProducts.length === 0 && (
              <div className="empty-catalogue">
                Créez d'abord un produit.
              </div>
            )}

            <div className="option-product-list">
              {sortedProducts.map(product => {
                const enabled = (links ?? []).some(
                  link =>
                    link.productId === product.id &&
                    link.groupId === selectedGroup,
                )

                return (
                  <label className="option-product-row" key={product.id}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={busy || links === undefined}
                      onChange={event => {
                        const checked = event.target.checked
                        void execute(() =>
                          setProductOptionGroup(
                            product.id,
                            selectedGroup,
                            checked,
                          ),
                        )
                      }}
                    />
                    <span>{product.name}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="category-error">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="product-success">
          {message}
        </p>
      )}
    </section>
  )
}
