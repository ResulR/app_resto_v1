import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../shared/database/db'
import {
  deleteDraft,
  listDrafts,
  type OrderDraft,
} from './draftRepository'

type Props = {
  activeDraftId: string | null
  onResume: (draft: OrderDraft) => void
}

export function DraftManager({
  activeDraftId,
  onResume,
}: Props) {
  const drafts = useLiveQuery(
    async () => {
      // Abonnement explicite aux modifications IndexedDB.
      await db.drafts.count()
      return listDrafts()
    },
    [],
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove(draft: OrderDraft) {
    if (busy) return

    if (
      !window.confirm(
        'Supprimer définitivement cette commande en attente ?',
      )
    ) {
      return
    }

    setBusy(true)
    setError('')

    try {
      await deleteDraft(draft.id)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Impossible de supprimer le brouillon.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="draft-manager">
      <div className="products-heading">
        <h2>Commandes en attente</h2>
        <span>{drafts?.length ?? 0}</span>
      </div>

      {drafts === undefined && <p>Chargement...</p>}

      {drafts?.length === 0 && (
        <div className="empty-catalogue">
          Aucune commande en attente.
        </div>
      )}

      {error && (
        <p className="category-error" role="alert">{error}</p>
      )}

      <div className="draft-list">
        {drafts?.map(draft => (
          <div className="draft-row" key={draft.id}>
            <div className="draft-info">
              <strong>
                {draft.items.reduce(
                  (total, item) => total + item.quantity,
                  0,
                )} article(s)
              </strong>

              <span>
                {new Date(draft.updatedAt)
                  .toLocaleString('fr-BE')}
              </span>

              {draft.id === activeDraftId && (
                <span>Brouillon actuellement ouvert</span>
              )}
            </div>

            <div className="draft-actions">
              <button
                type="button"
                disabled={busy || draft.id === activeDraftId}
                onClick={() => onResume(draft)}
              >
                Reprendre
              </button>

              <button
                type="button"
                disabled={busy || draft.id === activeDraftId}
                onClick={() => void remove(draft)}
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
