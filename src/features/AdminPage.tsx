// CH-03 / ADM-02 — Admin Panel: create, edit and delete challenges.
//
// The form (./ChallengeForm) owns validation and its error display; the
// confirmation dialog (./ConfirmDialog) owns the irreversible step. This page
// owns the data around them: the list of existing challenges, the calls to
// adminChallengeMutation, and the reload after a change.
//
// Remounting the form is how mode changes: `key` mixes the mode, the challenge
// id and a counter that ticks after each change, so switching create ↔ edit (or
// saving) always yields a correctly seeded, error-free form.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  adminChallengeMutation,
  deleteChallenge,
  fetchChallenges,
  formatDateRange,
  targetLabel,
  type Challenge,
  type ChallengeInput,
} from './challenges'
import {
  formValuesFromChallenge,
  type ChallengeFormValues,
} from './challengeValidation'
import { ChallengeForm } from './ChallengeForm'
import { ConfirmDialog } from './ConfirmDialog'

export function AdminPage() {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  /** The challenge being edited; null = the form creates a new one. */
  const [editing, setEditing] = useState<Challenge | null>(null)
  /** Bumped after every save to hand out a fresh form. */
  const [formVersion, setFormVersion] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  /** ADM-02 — challenge awaiting confirmation; null = no dialog on screen. */
  const [pendingDelete, setPendingDelete] = useState<Challenge | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  /** The Delete button that opened the dialog, so focus can return to it. */
  const deleteTrigger = useRef<HTMLElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      setChallenges(await fetchChallenges())
    } catch (err) {
      setChallenges(null)
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // One fetch on mount (the ref keeps StrictMode's double mount to one call,
  // same guard the other data screens use).
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    void load()
  }, [load])

  /** CH-03 — reached only with validated values (see ChallengeForm). */
  const save = async (input: ChallengeInput) => {
    await adminChallengeMutation(editing ? 'update' : 'create', input, editing?.id)
    setStatusMessage(
      editing
        ? `Updated “${input.title}”.`
        : `Created “${input.title}”.`,
    )
    setEditing(null)
    setFormVersion((v) => v + 1)
    await load()
  }

  /**
   * ADM-02 — close the dialog and hand focus back to the button that opened it
   * (after a delete the list reloads, so that button may be gone by then).
   */
  const closeDeleteDialog = () => {
    setPendingDelete(null)
    setDeleteError(null)
    const trigger = deleteTrigger.current
    deleteTrigger.current = null
    if (trigger?.isConnected) trigger.focus()
  }

  /**
   * ADM-02 — the only path that deletes anything, and it runs solely from the
   * dialog's destructive button: cancelling never reaches this code.
   */
  const confirmDelete = async () => {
    const target = pendingDelete
    if (!target) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await deleteChallenge(target.id)
      setStatusMessage(`Deleted “${target.title}”.`)
      // Editing a challenge that no longer exists would leave the form pointed
      // at a missing doc; a half-typed CREATE form is deliberately left alone.
      if (editing?.id === target.id) {
        setEditing(null)
        setFormVersion((v) => v + 1)
      }
      closeDeleteDialog()
      await load()
    } catch (err) {
      // Spec's kļūdu uzvedība: the dialog stays open and says why, so the
      // admin can retry or cancel — nothing was removed.
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteBusy(false)
    }
  }

  const initialValues: ChallengeFormValues | undefined = editing
    ? formValuesFromChallenge(editing)
    : undefined
  const mode = editing ? 'update' : 'create'

  return (
    <div className="admin-screen">
      <section className="admin-panel">
        <h2 className="admin-title">
          {mode === 'update' ? 'Edit challenge' : 'New challenge'}
        </h2>
        <ChallengeForm
          key={`${mode}:${editing?.id ?? 'new'}:${formVersion}`}
          mode={mode}
          initialValues={initialValues}
          onSubmit={save}
          onCancel={() => {
            setEditing(null)
            setStatusMessage(null)
          }}
        />
      </section>

      {statusMessage && (
        <p className="form-saved" role="status">
          {statusMessage}
        </p>
      )}

      <section className="admin-panel">
        <h2 className="admin-title">Existing challenges</h2>
        {loading ? (
          <p className="board-status">Loading…</p>
        ) : listError ? (
          <div className="guard">
            <p className="guard-text">Could not load challenges.</p>
            <p className="placeholder-note">{listError}</p>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        ) : challenges && challenges.length > 0 ? (
          <ul className="admin-challenge-list">
            {challenges.map((challenge) => (
              <li key={challenge.id} className="admin-challenge-row">
                <div className="admin-challenge-info">
                  <span className="admin-challenge-title">
                    {challenge.title}
                  </span>
                  <span className="admin-challenge-meta">
                    {targetLabel(challenge)} ·{' '}
                    {formatDateRange(challenge.startDate, challenge.endDate)}
                  </span>
                </div>
                <div className="admin-challenge-actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={`Edit ${challenge.title}`}
                    onClick={() => {
                      setEditing(challenge)
                      setStatusMessage(null)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    aria-label={`Delete ${challenge.title}`}
                    onClick={(event) => {
                      // Remember the trigger for focus restoration on close.
                      deleteTrigger.current = event.currentTarget
                      setDeleteError(null)
                      setStatusMessage(null)
                      setPendingDelete(challenge)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="board-status">
            No challenges yet — the form above creates the first one.
          </p>
        )}
        <p className="placeholder-note">
          Deleting is permanent for every player, so it always asks for
          confirmation first.
        </p>
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this challenge?"
          message={
            <>
              “{pendingDelete.title}” will be removed for every player and
              cannot be brought back. Progress already earned stays in the
              players' game results.
            </>
          }
          confirmLabel="Delete"
          busyLabel="Deleting…"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={closeDeleteDialog}
        />
      )}
    </div>
  )
}
