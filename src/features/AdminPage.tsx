// CH-03 — Admin Panel: create and edit challenges with validation.
//
// The form (./ChallengeForm) owns validation and its error display; this page
// owns the data around it: the list of existing challenges (tap Edit to load
// one into the form), the call to adminChallengeMutation, and the reload after
// a save. Delete + its confirmation modal arrive with ADM-02.
//
// Remounting the form is how mode changes: `key` mixes the mode, the challenge
// id and a counter that ticks after each save, so switching create ↔ edit (or
// saving) always yields a correctly seeded, error-free form.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  adminChallengeMutation,
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

export function AdminPage() {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  /** The challenge being edited; null = the form creates a new one. */
  const [editing, setEditing] = useState<Challenge | null>(null)
  /** Bumped after every save to hand out a fresh form. */
  const [formVersion, setFormVersion] = useState(0)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

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
    setSavedMessage(
      editing
        ? `Updated “${input.title}”.`
        : `Created “${input.title}”.`,
    )
    setEditing(null)
    setFormVersion((v) => v + 1)
    await load()
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
            setSavedMessage(null)
          }}
        />
      </section>

      {savedMessage && (
        <p className="form-saved" role="status">
          {savedMessage}
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
                <button
                  type="button"
                  className="btn btn-small"
                  aria-label={`Edit ${challenge.title}`}
                  onClick={() => {
                    setEditing(challenge)
                    setSavedMessage(null)
                  }}
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="board-status">
            No challenges yet — the form above creates the first one.
          </p>
        )}
        <p className="placeholder-note">
          Deleting a challenge arrives with the confirmation modal (ADM-02).
        </p>
      </section>
    </div>
  )
}
