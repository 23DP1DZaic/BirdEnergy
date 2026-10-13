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
import { useT } from '../i18n'

export function AdminPage() {
  const { t } = useT()
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
      t(editing ? 'admin.updated' : 'admin.created', { title: input.title }),
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
          {t(mode === 'update' ? 'admin.editTitle' : 'admin.newTitle')}
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
        <h2 className="admin-title">{t('admin.existing')}</h2>
        {loading ? (
          <p className="board-status">{t('common.loading')}</p>
        ) : listError ? (
          <div className="guard">
            <p className="guard-text">{t('challenges.error')}</p>
            <p className="placeholder-note">{listError}</p>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => void load()}
            >
              {t('common.retry')}
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
                  aria-label={t('admin.editAria', { title: challenge.title })}
                  onClick={() => {
                    setEditing(challenge)
                    setSavedMessage(null)
                  }}
                >
                  {t('admin.edit')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="board-status">
            {t('admin.empty')}
          </p>
        )}
        <p className="placeholder-note">
          {t('admin.deleteNote')}
        </p>
      </section>
    </div>
  )
}
