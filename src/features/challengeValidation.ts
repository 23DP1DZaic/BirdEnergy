// CH-03 — challenge form validation (pure: no React, no Firebase).
//
// One rule set for the admin form, mirroring the spec's obligātie noteikumi
// ("Validācija" section). ADM-01 re-validates the same payload server-side —
// this copy is instant feedback, never the trust boundary.
//
//   title        required, trimmed 3–80 characters
//   description  required, trimmed 10–500 characters
//   type         required, one of the two supported enum values
//   targetValue  required whole number, > 0, ≤ 1 000 000
//   startDate    required, valid date
//   endDate      required, valid date, not earlier than startDate
//
// validateChallengeForm returns errors keyed BY FIELD, so the form can render
// each message under its own input, mark that input invalid and focus the
// first offender (CH-03 DoD: invalid data blocks saving, errors under fields).

import type { Challenge, ChallengeInput, ChallengeType } from './challenges'

export type ChallengeFormField =
  | 'title'
  | 'description'
  | 'type'
  | 'targetValue'
  | 'startDate'
  | 'endDate'

/** Form order — used for the first-invalid focus and any summary listing. */
export const CHALLENGE_FORM_FIELDS: readonly ChallengeFormField[] = [
  'title',
  'description',
  'type',
  'targetValue',
  'startDate',
  'endDate',
]

export const CHALLENGE_TITLE_MIN = 3
export const CHALLENGE_TITLE_MAX = 80
export const CHALLENGE_DESCRIPTION_MIN = 10
export const CHALLENGE_DESCRIPTION_MAX = 500
/** MVP upper bound from the spec ("augšējo robežu, piemēram, 1 000 000"). */
export const CHALLENGE_TARGET_MAX = 1_000_000

/**
 * Raw form state. Everything is a string: the inputs are text/number/date
 * controls, and validation — not the input type — decides what is acceptable
 * (a number input still yields '', '1.5' or '1e3' depending on the browser).
 */
export interface ChallengeFormValues {
  title: string
  description: string
  /** '' until the admin picks one (the select's placeholder option). */
  type: ChallengeType | ''
  targetValue: string
  /** 'YYYY-MM-DD' from <input type="date">; '' when not chosen yet. */
  startDate: string
  endDate: string
}

export const EMPTY_CHALLENGE_FORM: ChallengeFormValues = {
  title: '',
  description: '',
  type: '',
  targetValue: '',
  startDate: '',
  endDate: '',
}

export type ChallengeFormErrors = Partial<Record<ChallengeFormField, string>>

const count = (n: number) => `${n} character${n === 1 ? '' : 's'}`

/**
 * 'YYYY-MM-DD' → local midnight. null when the text is not exactly that shape
 * or is not a real day: Date would silently roll '2026-02-31' over to 3 March,
 * so the round-trip is checked.
 */
export function parseDateInput(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

/** Date → 'YYYY-MM-DD' in LOCAL time (the inverse of parseDateInput). */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function titleError(raw: string): string | null {
  const title = raw.trim()
  if (!title) return 'Title is required.'
  if (title.length < CHALLENGE_TITLE_MIN) {
    return `Use at least ${CHALLENGE_TITLE_MIN} characters (${count(title.length)} so far).`
  }
  if (title.length > CHALLENGE_TITLE_MAX) {
    return `Use at most ${CHALLENGE_TITLE_MAX} characters (${count(title.length)}).`
  }
  return null
}

function descriptionError(raw: string): string | null {
  const description = raw.trim()
  if (!description) return 'Description is required.'
  if (description.length < CHALLENGE_DESCRIPTION_MIN) {
    return `Use at least ${CHALLENGE_DESCRIPTION_MIN} characters (${count(description.length)} so far).`
  }
  if (description.length > CHALLENGE_DESCRIPTION_MAX) {
    return `Use at most ${CHALLENGE_DESCRIPTION_MAX} characters (${count(description.length)}).`
  }
  return null
}

function targetError(raw: string): string | null {
  const text = raw.trim()
  if (!text) return 'Target is required.'
  const value = Number(text)
  if (!Number.isFinite(value)) return 'Enter a number.'
  if (!Number.isInteger(value)) return 'Use a whole number — no decimals.'
  if (value <= 0) return 'Target must be greater than 0.'
  if (value > CHALLENGE_TARGET_MAX) {
    return `Target must be at most ${CHALLENGE_TARGET_MAX.toLocaleString('en-GB')}.`
  }
  return null
}

/** Every rule, keyed by field. An empty object means the form may be saved. */
export function validateChallengeForm(
  values: ChallengeFormValues,
): ChallengeFormErrors {
  const errors: ChallengeFormErrors = {}

  const title = titleError(values.title)
  if (title) errors.title = title

  const description = descriptionError(values.description)
  if (description) errors.description = description

  if (values.type !== 'single_game_score' && values.type !== 'games_played') {
    errors.type = 'Choose a challenge type.'
  }

  const target = targetError(values.targetValue)
  if (target) errors.targetValue = target

  // Parsed once: the end-date rule compares against the start window.
  const start = parseDateInput(values.startDate)
  if (!values.startDate.trim()) errors.startDate = 'Start date is required.'
  else if (!start) errors.startDate = 'Enter a valid start date.'

  const end = parseDateInput(values.endDate)
  if (!values.endDate.trim()) errors.endDate = 'End date is required.'
  else if (!end) errors.endDate = 'Enter a valid end date.'
  else if (start && end.getTime() < start.getTime()) {
    errors.endDate = 'End date must be on or after the start date.'
  }

  return errors
}

/** First invalid field in form order — the one to focus after a bad submit. */
export function firstInvalidField(
  errors: ChallengeFormErrors,
): ChallengeFormField | null {
  return CHALLENGE_FORM_FIELDS.find((field) => errors[field]) ?? null
}

/**
 * Validated values → the ChallengeInput ADM-01 receives. Returns null while
 * anything is invalid, so no caller can build a payload from bad input.
 *
 * Dates: the picker chooses a DAY, not a time. The window opens at local 00:00
 * on startDate and closes at local 23:59:59.999 on endDate, so a one-day
 * challenge stays Active for that whole day (deriveStatus compares absolute
 * timestamps, see challenges.ts).
 */
export function toChallengeInput(
  values: ChallengeFormValues,
): ChallengeInput | null {
  if (firstInvalidField(validateChallengeForm(values)) !== null) return null
  const startDate = parseDateInput(values.startDate)
  const endDate = parseDateInput(values.endDate)
  if (!startDate || !endDate) return null // unreachable once valid
  // Re-checked here so the narrow type is real, not a cast.
  if (values.type !== 'single_game_score' && values.type !== 'games_played') {
    return null
  }
  endDate.setHours(23, 59, 59, 999)
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    type: values.type,
    targetValue: Number(values.targetValue.trim()),
    startDate,
    endDate,
  }
}

/** Existing challenge → form values (edit mode). */
export function formValuesFromChallenge(
  challenge: Challenge,
): ChallengeFormValues {
  return {
    title: challenge.title,
    description: challenge.description,
    type: challenge.type,
    targetValue: String(challenge.targetValue),
    startDate: toDateInputValue(challenge.startDate),
    endDate: toDateInputValue(challenge.endDate),
  }
}
