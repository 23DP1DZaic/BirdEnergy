// DATA-01 — user profile + data-processing consent (client side).
//
// The Cloud Functions create users/{uid} when the user consents:
//  - authenticateTelegram() when called with acceptDataProcessing: true
//  - acceptDataProcessing() — the dedicated callable used by the GamePage
//    consent dialog; runs against the live Firebase session, so it works
//    even when the Telegram initData is stale (24h freshness window).
//
// Firestore rules (SEC-01) let a signed-in user read only their own
// users/{uid} doc; all writes happen server-side via the functions.
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'

export interface UserProfile {
  uid: string
  telegramId: number
  /** Telegram @username (immutable here — set in the Telegram app). */
  username: string | null
  firstName: string
  lastName: string | null
  languageCode: string | null
  /** Telegram profile photo (signed initData photo_url); null when the user
   *  has none — the UI falls back to a bird sprite. */
  photoUrl?: string | null
  /** In-game display name (UI-04 updateProfile); preferred over @username. */
  inGameName?: string | null
  role?: 'user' | 'admin'
  bestScore?: number
  /** Aggregates maintained by submitGameResult (was misnamed gamesPlayed). */
  totalGames?: number
  totalScore?: number
  /** UI-04 — preferred bird skin index (birdSkinUrls), background index and
   *  ground tile index; hydrated into localStorage on sign-in. */
  preferredBird?: number
  preferredBackground?: number
  preferredGround?: number
  acceptedDataProcessingAt?: { toDate(): Date }
  createdAt?: { toDate(): Date }
}

export type ProfileCheck =
  | { kind: 'consented'; profile: UserProfile }
  | { kind: 'needs-consent' }
  | { kind: 'error'; message: string }

/** Reads users/{uid} and decides whether the consent dialog is needed. */
export async function checkProfileConsent(uid: string): Promise<ProfileCheck> {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return { kind: 'needs-consent' }
    const profile = snap.data() as UserProfile
    if (!profile.acceptedDataProcessingAt) return { kind: 'needs-consent' }
    return { kind: 'consented', profile }
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Saves the consent (creates/updates users/{uid}) via the Cloud Function. */
export async function acceptDataProcessing(): Promise<void> {
  const accept = httpsCallable<Record<string, never>, { ok: boolean }>(
    functions,
    'acceptDataProcessing',
  )
  await accept({})
}

/** DATA-01/UI-04 — fields updateProfile accepts (functions/src/index.ts). */
export interface UpdateProfileInput {
  /** In-game display name: 3-20 chars of [A-Za-z0-9_]. */
  username?: string
  preferredBird?: number
  preferredBackground?: number
  preferredGround?: number
}

export interface UpdateProfileResponse {
  ok: boolean
  /** The effective in-game name (unchanged when only prefs were sent). */
  inGameName: string
}

/**
 * Saves profile edits through the updateProfile Cloud Function — Firestore
 * rules keep users/ write=server-only (SEC-01), so the client never writes
 * the document directly. Throws a plain Error with the server's message on
 * validation failure (e.g. "name already taken").
 */
export async function updateProfile(
  input: UpdateProfileInput,
): Promise<UpdateProfileResponse> {
  const update = httpsCallable<UpdateProfileInput, UpdateProfileResponse>(
    functions,
    'updateProfile',
  )
  const result = await update(input)
  return result.data
}

/** UI-04 — in-game name rules, mirrored server-side in functions/src/index.ts. */
export const IN_GAME_NAME_MIN = 3
export const IN_GAME_NAME_MAX = 20
const IN_GAME_NAME_PATTERN = /^[A-Za-z0-9_]+$/

/** True when `name` is a valid in-game name (same rules as the callable). */
export function isValidInGameName(name: string): boolean {
  const trimmed = name.trim()
  return (
    trimmed.length >= IN_GAME_NAME_MIN &&
    trimmed.length <= IN_GAME_NAME_MAX &&
    IN_GAME_NAME_PATTERN.test(trimmed)
  )
}

/** DATA-01 — the numbers submitGameResult accepts (mirrors engine.RunResult). */
export interface SubmitRunInput {
  score: number
  durationMs: number
  jumpCount: number
}

export interface SubmitRunResponse {
  ok: boolean
  bestScore: number
  totalGames: number
  totalScore: number
  newBest: boolean
}

/**
 * Persists one finished run via the submitGameResult Cloud Function. Fire-and-
 * forget friendly on the caller side, but this promise surfaces validation or
 * auth failures — GamePage logs them without blocking the game-over screen.
 */
export async function submitGameResult(
  run: SubmitRunInput,
): Promise<SubmitRunResponse> {
  const submit = httpsCallable<SubmitRunInput, SubmitRunResponse>(
    functions,
    'submitGameResult',
  )
  const result = await submit(run)
  return result.data
}
