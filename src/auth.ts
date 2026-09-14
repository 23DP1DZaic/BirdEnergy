// src/auth.ts — AUTH-02: client-side call to the authenticateTelegram function.
// AUTH-03 will build on this: exchange the validated identity for a Firebase
// custom token and signInWithCustomToken.

import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import { getInitData } from './telegram'

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
  user: AuthenticatedTelegramUser
}

/**
 * Sends raw initData to the authenticateTelegram Cloud Function for
 * server-side HMAC validation. Throws if not in Telegram, initData is
 * missing, or server-side validation rejects the data.
 */
export async function authenticateTelegram(): Promise<AuthenticatedTelegramUser> {
  const initData = getInitData()
  if (!initData) {
    throw new Error('initData unavailable — open the app via Telegram.')
  }

  const authenticate = httpsCallable<
    { initData: string },
    AuthenticateTelegramResponse
  >(functions, 'authenticateTelegram')

  const result = await authenticate({ initData })
  return result.data.user
}
