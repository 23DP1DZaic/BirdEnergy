// src/auth.ts — AUTH-02 + AUTH-03 client flow.
//
// 1. authenticateTelegram(): send raw initData to the Cloud Function for
//    server-side HMAC validation (AUTH-02).
// 2. signInWithTelegram(): exchange the returned custom token for a real
//    Firebase session via signInWithCustomToken (AUTH-03). The user's role
//    (user/admin) is resolved server-side from a whitelist and arrives both
//    in the response and as a custom claim on the Firebase ID token.

import { signInWithCustomToken, onAuthStateChanged } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from './firebase'
import { getDevTelegramId } from './devAuth'
import { getInitData } from './telegram'

export type TelegramRole = 'user' | 'admin'

export interface AuthenticatedTelegramUser {
  telegramId: number
  username: string | null
  firstName: string
  lastName: string | null
  languageCode: string | null
  authDate: number
}

interface AuthenticateTelegramResponse {
  ok: boolean
  customToken: string
  role: TelegramRole
  user: AuthenticatedTelegramUser
}

interface AuthenticateTelegramRequest {
  initData?: string
  /** DEV-ONLY (src/devAuth.ts): accepted by the Functions emulator only. */
  devTelegramId?: number
}

export interface TelegramSignInResult {
  firebaseUid: string
  role: TelegramRole
  user: AuthenticatedTelegramUser
}

/**
 * AUTH-02: server-side validation of initData. Throws on any rejection.
 * Inside Telegram the signed initData is always used; in a plain browser the
 * DEV-only VITE_TELEGRAM_ID is sent instead and the Functions emulator mints
 * the same kind of session (see src/devAuth.ts).
 */
export async function authenticateTelegram(): Promise<AuthenticateTelegramResponse> {
  const initData = getInitData()
  const devTelegramId = initData ? null : getDevTelegramId()

  if (!initData && devTelegramId === null) {
    throw new Error(
      'initData unavailable — open the app via Telegram (or set VITE_TELEGRAM_ID and VITE_USE_EMULATORS for local dev).',
    )
  }

  const authenticate = httpsCallable<
    AuthenticateTelegramRequest,
    AuthenticateTelegramResponse
  >(functions, 'authenticateTelegram')

  const result = await authenticate(
    devTelegramId !== null ? { devTelegramId } : { initData },
  )
  return result.data
}

/**
 * AUTH-03: full sign-in — validate initData, then exchange the custom token
 * for a Firebase session. Resolves with the signed-in identity and role.
 */
export async function signInWithTelegram(): Promise<TelegramSignInResult> {
  const { customToken, role, user } = await authenticateTelegram()
  const credential = await signInWithCustomToken(auth, customToken)
  return { firebaseUid: credential.user.uid, role, user }
}

/** Subscribes to Firebase session changes; returns an unsubscribe function. */
export function observeAuthSession(
  callback: (uid: string | null) => void,
): () => void {
  return onAuthStateChanged(auth, (user) => callback(user?.uid ?? null))
}
