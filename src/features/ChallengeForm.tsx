// CH-03 — the admin challenge form: create a new challenge or edit an existing
// one, with the validation from ./challengeValidation (pure rules, shared with
// ADM-01's server-side re-validation).
//
// UI half of the DoD:
//   * an invalid field shows its message directly under the input, gets the
//     .form-input-invalid state and aria-invalid;
//   * Save is refused while anything is invalid — no callable is invoked, and
//     the first invalid field is focused (spec's kļūdu uzvedība);
//   * a rejected call keeps every entered value and reports the reason above
//     the buttons, so only the backend failed, never the typing.
//
// State is internal: the parent switches create ↔ edit by REMOUNTING the form
// (key), which is also how a fresh form is handed out after a save.
import { useRef, useState, type FormEvent } from 'react'
import type { ChallengeFormMode, ChallengeInput } from './challenges'
import { LOCALE_CODE, getLocale, useT } from '../i18n'
import type { ChallengeFormError } from './challengeValidation'
import { PixelIcon } from './ui/PixelIcon'
import {
  CHALLENGE_DESCRIPTION_MAX,
  CHALLENGE_DESCRIPTION_MIN,
  CHALLENGE_TARGET_MAX,
  CHALLENGE_TITLE_MAX,
  CHALLENGE_TITLE_MIN,
  CHALLENGE_FORM_FIELDS,
  EMPTY_CHALLENGE_FORM,
  firstInvalidField,
  toChallengeInput,
  validateChallengeForm,
  type ChallengeFormErrors,
  type ChallengeFormField,
  type ChallengeFormValues,
} from './challengeValidation'

interface ChallengeFormProps {
  /** 'create' → blank form, 'update' → the challenge in initialValues. */
  mode: ChallengeFormMode
  /** Existing values (update mode). Ignored on a fresh mount of 'create'. */
  initialValues?: ChallengeFormValues
  /** Called only with valid values; a rejection is shown in the form. */
  onSubmit: (input: ChallengeInput) => Promise<void>
  /** Update mode only: leave edit mode and go back to the create form. */
  onCancel?: () => void
}

/**
 * The message under one field — always rendered under its own input.
 * Errors arrive as i18n keys, so the wording is resolved here, in render.
 */
function FieldError({
  id,
  error,
}: {
  id: string
  error?: ChallengeFormError
}) {
  const { t } = useT()
  if (!error) return null
  return (
    <p className="form-error" id={id} role="alert">
      {t(error.key, error.params)}
    </p>
  )
}

export function ChallengeForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: ChallengeFormProps) {
  const { t, tn } = useT()
  const [values, setValues] = useState<ChallengeFormValues>(
    initialValues ?? EMPTY_CHALLENGE_FORM,
  )
  const [errors, setErrors] = useState<ChallengeFormErrors>({})
  /** True right after a refused save (the summary line above the buttons). */
  const [blocked, setBlocked] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const invalidFields = CHALLENGE_FORM_FIELDS.filter((f) => errors[f])

  /** One typed character: update the value and clear that field's error. */
  const change = (field: ChallengeFormField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => {
      if (!e[field]) return e
      const rest = { ...e }
      delete rest[field]
      return rest
    })
    setBlocked(false)
    setSubmitError(null)
    setSaved(false)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateChallengeForm(values)
    setErrors(nextErrors)
    const first = firstInvalidField(nextErrors)
    if (first) {
      // CH-03 DoD: invalid data blocks saving — nothing goes to the backend.
      setSaved(false)
      setSubmitError(null)
      setBlocked(true)
      formRef.current
        ?.querySelector<HTMLElement>(`#challenge-${first}`)
        ?.focus()
      return
    }
    const input = toChallengeInput(values)
    if (!input) return // unreachable — the same rules just passed
    setBlocked(false)
    setSubmitError(null)
    setSaved(false)
    setBusy(true)
    try {
      await onSubmit(input)
      setSaved(true)
    } catch (err) {
      // Backend failure: general message, entered values untouched.
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  /** Input class + ARIA wiring for one field (invalid state, error link). */
  const inputClass = (field: ChallengeFormField) =>
    `form-input${errors[field] ? ' form-input-invalid' : ''}`
  const ariaInvalid = (field: ChallengeFormField) =>
    errors[field] ? true : undefined
  const ariaDescribedBy = (field: ChallengeFormField) =>
    errors[field] ? `challenge-${field}-error` : undefined

  return (
    <form
      className="challenge-form"
      ref={formRef}
      // Our messages are the feedback; the browser's native bubbles would
      // pre-empt them without saying which rule was broken.
      noValidate
      onSubmit={(e) => void handleSubmit(e)}
    >
      <div className="form-field">
        <label className="form-label" htmlFor="challenge-title">
          {t('form.title')}
        </label>
        <input
          id="challenge-title"
          type="text"
          className={inputClass('title')}
          maxLength={CHALLENGE_TITLE_MAX}
          placeholder={t('form.range', {
            min: CHALLENGE_TITLE_MIN,
            max: CHALLENGE_TITLE_MAX,
          })}
          autoComplete="off"
          spellCheck={false}
          value={values.title}
          aria-invalid={ariaInvalid('title')}
          aria-describedby={ariaDescribedBy('title')}
          onChange={(e) => change('title', e.target.value)}
        />
        <FieldError id="challenge-title-error" error={errors.title} />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="challenge-description">
          {t('form.description')}
        </label>
        <textarea
          id="challenge-description"
          className={inputClass('description')}
          rows={3}
          maxLength={CHALLENGE_DESCRIPTION_MAX}
          placeholder={t('form.range', {
            min: CHALLENGE_DESCRIPTION_MIN,
            max: CHALLENGE_DESCRIPTION_MAX,
          })}
          value={values.description}
          aria-invalid={ariaInvalid('description')}
          aria-describedby={ariaDescribedBy('description')}
          onChange={(e) => change('description', e.target.value)}
        />
        <FieldError id="challenge-description-error" error={errors.description} />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="challenge-type">
            {t('form.type')}
          </label>
          <select
            id="challenge-type"
            className={inputClass('type')}
            value={values.type}
            aria-invalid={ariaInvalid('type')}
            aria-describedby={ariaDescribedBy('type')}
            onChange={(e) => change('type', e.target.value)}
          >
            <option value="">{t('form.typePlaceholder')}</option>
            <option value="single_game_score">{t('form.typeScore')}</option>
            <option value="games_played">{t('form.typeGames')}</option>
          </select>
          <FieldError id="challenge-type-error" error={errors.type} />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="challenge-targetValue">
            {t('form.target')}
          </label>
          <input
            id="challenge-targetValue"
            type="number"
            className={inputClass('targetValue')}
            min={1}
            max={CHALLENGE_TARGET_MAX}
            step={1}
            inputMode="numeric"
            placeholder={t('form.targetPlaceholder')}
            value={values.targetValue}
            aria-invalid={ariaInvalid('targetValue')}
            aria-describedby={ariaDescribedBy('targetValue')}
            onChange={(e) => change('targetValue', e.target.value)}
          />
          <FieldError id="challenge-targetValue-error" error={errors.targetValue} />
          <p className="form-hint">
            {values.type === 'games_played'
              ? t('form.hintGames')
              : values.type === 'single_game_score'
                ? t('form.hintScore')
                : t('form.hintPickType')}
          </p>
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="challenge-startDate">
            {t('form.startDate')}
          </label>
          <input
            id="challenge-startDate"
            type="date"
            className={inputClass('startDate')}
            value={values.startDate}
            aria-invalid={ariaInvalid('startDate')}
            aria-describedby={ariaDescribedBy('startDate')}
            onChange={(e) => change('startDate', e.target.value)}
          />
          <FieldError id="challenge-startDate-error" error={errors.startDate} />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="challenge-endDate">
            {t('form.endDate')}
          </label>
          <input
            id="challenge-endDate"
            type="date"
            className={inputClass('endDate')}
            value={values.endDate}
            aria-invalid={ariaInvalid('endDate')}
            aria-describedby={ariaDescribedBy('endDate')}
            onChange={(e) => change('endDate', e.target.value)}
          />
          <FieldError id="challenge-endDate-error" error={errors.endDate} />
        </div>
      </div>

      {blocked && (
        <p className="form-error form-error-general" role="alert">
          {tn('form.blocked', invalidFields.length)}
        </p>
      )}
      {submitError && (
        <p className="form-error form-error-general" role="alert">
          {submitError}
        </p>
      )}
      {saved && (
        <p className="form-saved" role="status">
          {t('form.saved')}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-small" disabled={busy}>
          <PixelIcon name="check" size={18} />
          {busy
            ? t('common.saving')
            : mode === 'create'
              ? t('form.create')
              : t('form.saveChanges')}
        </button>
        {mode === 'update' && onCancel && (
          <button
            type="button"
            className="btn btn-small"
            disabled={busy}
            onClick={onCancel}
          >
            <PixelIcon name="close" size={18} />
            {t('form.cancel')}
          </button>
        )}
      </div>

      <p className="placeholder-note">
        {t('form.rules', {
          titleMin: CHALLENGE_TITLE_MIN,
          titleMax: CHALLENGE_TITLE_MAX,
          descMin: CHALLENGE_DESCRIPTION_MIN,
          descMax: CHALLENGE_DESCRIPTION_MAX,
          targetMax: CHALLENGE_TARGET_MAX.toLocaleString(
            LOCALE_CODE[getLocale()],
          ),
        })}
      </p>
    </form>
  )
}
