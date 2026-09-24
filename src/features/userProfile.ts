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
  username: string | null
  firstName: string
  lastName: string | null
  languageCode: string | null
  role?: 'user' | 'admin'
  bestScore?: number
  gamesPlayed?: number
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
