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

export interface TelegramSignInResult {
  firebaseUid: string
  role: TelegramRole
  user: AuthenticatedTelegramUser
}

/** AUTH-02: server-side validation of initData. Throws on any rejection. */
export async function authenticateTelegram(): Promise<AuthenticateTelegramResponse> {
  const initData = getInitData()
  if (!initData) {
    throw new Error('initData unavailable — open the app via Telegram.')
  }

  const authenticate = httpsCallable<
    { initData: string },
    AuthenticateTelegramResponse
  >(functions, 'authenticateTelegram')

  const result = await authenticate({ initData })
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
