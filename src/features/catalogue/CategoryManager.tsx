import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import {
  createCategory,
  listCategories,
  moveCategory,
  renameCategory,
} from './categoryRepository'

export function CategoryManager() {
  const categories = useLiveQuery(listCategories)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function execute(action: () => Promise<void>) {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      await action()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Une erreur est survenue.',
      )
    } finally {
      setBusy(false)
    }
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    void execute(async () => {
      await createCategory(name)
      setName('')
    })
  }

  function handleRename(id: string, currentName: string) {
    const nextName = window.prompt('Nouveau nom de la catégorie', currentName)

    if (nextName === null) return

    void execute(() => renameCategory(id, nextName))
  }

  return (
    <section className="category-manager">
      <div className="section-heading">
        <span className="eyebrow">PARAMÈTRES</span>
        <h1>Gestion des catégories</h1>
        <p>Les modifications sont enregistrées automatiquement sur cet appareil.</p>
      </div>

      <form className="category-form" onSubmit={handleCreate}>
        <label htmlFor="category-name">Nouvelle catégorie</label>

        <div className="category-form-row">
          <input
            id="category-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. Paninis"
            required
          />

          <button type="submit" disabled={busy || !name.trim()}>
            Ajouter
          </button>
        </div>
      </form>

      {error && (
        <p className="category-error" role="alert">
          {error}
        </p>
      )}

      {categories === undefined && <p>Chargement des catégories...</p>}

      {categories?.length === 0 && (
        <div className="empty-catalogue">
          Aucune catégorie créée.
        </div>
      )}

      <div className="category-list">
        {categories?.map((category, index) => (
          <div className="category-row" key={category.id}>
            <span className="category-row-name">{category.name}</span>

            <div className="category-actions">
              <button
                type="button"
                aria-label={`Monter ${category.name}`}
                disabled={busy || index === 0}
                onClick={() => void execute(() => moveCategory(category.id, -1))}
              >
                ↑
              </button>

              <button
                type="button"
                aria-label={`Descendre ${category.name}`}
                disabled={busy || index === categories.length - 1}
                onClick={() => void execute(() => moveCategory(category.id, 1))}
              >
                ↓
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleRename(category.id, category.name)}
              >
                Renommer
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
