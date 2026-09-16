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
  /** Client platform, e.g. "android" | "ios" | "tdesktop". "unknown" when
   *  the SDK script loaded outside a Telegram client. */
  platform?: string
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

/** Normalizes an env value (strips @, slashes, whitespace) or falls back. */
function readLinkPart(value: string | undefined, fallback: string): string {
  const configured: string = value ?? ''
  return configured.trim().replace(/^[@/]+/, '') || fallback
}

/**
 * Bot (@handle) hosting the Mini App, overridable with
 * VITE_TELEGRAM_BOT_USERNAME so other builds can point at a different bot.
 */
export const telegramBotUsername: string = readLinkPart(
  import.meta.env.VITE_TELEGRAM_BOT_USERNAME,
  'BirdEnergy_testbot',
)

/**
 * Mini App short name (the part after the bot in t.me/<bot>/<app>), overridable
 * with VITE_TELEGRAM_APP_NAME. Set on the bot via @BotFather → Bot Settings →
 * Configure Mini App.
 */
export const telegramAppName: string = readLinkPart(
  import.meta.env.VITE_TELEGRAM_APP_NAME,
  'birdenergygame',
)

/**
 * Public entry point used when the app is NOT running inside Telegram. The
 * deep link goes straight to the Mini App, which Telegram opens in-app and
 * where initData sign-in does work.
 */
export function getTelegramBotLink(): string {
  return `https://t.me/${telegramBotUsername}/${telegramAppName}`
}

/** Returns the Telegram WebApp instance, or null outside Telegram. */
export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null
}

/**
 * True when the app is running inside a Telegram client.
 *
 * index.html loads telegram-web-app.js unconditionally, and that script also
 * defines window.Telegram.WebApp in a plain browser — with an empty initData,
 * no initDataUnsafe.user and platform "unknown" (checked against SDK 6.0). So
 * the object merely existing proves nothing; only a real Telegram client fills
 * one of these in.
 */
export function isTelegramEnvironment(): boolean {
  const webApp = getTelegramWebApp()
  if (!webApp) return false
  if (webApp.initData.length > 0) return true
  if (webApp.initDataUnsafe?.user != null) return true
  return Boolean(webApp.platform && webApp.platform !== 'unknown')
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
