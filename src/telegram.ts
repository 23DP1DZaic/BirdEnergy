// src/telegram.ts — AUTH-01: Telegram WebApp SDK integration
//
// The official SDK script is loaded synchronously in index.html, so
// window.Telegram.WebApp exists before this module is imported (when the app
// is opened via Telegram). In a normal browser it is undefined — every helper
// here degrades gracefully so the app still works during local development.

/** Minimal typed subset of the Telegram WebApp SDK that the app uses. */
export interface TelegramWebApp {
  /** Raw, signed auth data. Empty string outside Telegram. Send as-is to the
   *  `authenticateTelegram` Cloud Function (AUTH-02) for HMAC validation. */
  initData: string
  /** Parsed initData. NOT trustworthy (client-side) — for UI display only. */
  initDataUnsafe: {
    user?: TelegramWebAppUser
    start_param?: string
  }
  version: string
  colorScheme: 'light' | 'dark'
  ready(): void
  expand(): void
}

export interface TelegramWebAppUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

/** Returns the Telegram WebApp instance, or null outside Telegram. */
export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null
}

/** True when the app is running inside a Telegram client. */
export function isTelegramEnvironment(): boolean {
  return getTelegramWebApp() !== null
}

/** Raw initData string for backend validation. Empty string outside Telegram. */
export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? ''
}

/** Telegram user from initDataUnsafe. UI-only — never trust it for auth. */
export function getTelegramUser(): TelegramWebAppUser | null {
  return getTelegramWebApp()?.initDataUnsafe?.user ?? null
}

let initialized = false

/**
 * One-time WebApp setup: ready() tells Telegram the app is mounted,
 * expand() requests the full-height viewport. Safe to call multiple times
 * (React StrictMode mounts effects twice in dev).
 */
export function initTelegramWebApp(): void {
  const webApp = getTelegramWebApp()
  if (!webApp || initialized) return

  webApp.ready()
  webApp.expand()
  initialized = true
}
