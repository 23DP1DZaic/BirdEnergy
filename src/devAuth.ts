// src/devAuth.ts — DEV-ONLY local login (running the Mini App in a browser).
//
// Outside Telegram there is no signed initData, so authenticateTelegram (AUTH-02)
// cannot validate a session and the app stays a guest. For local work you can
// put your own Telegram id in birdenergy/.env (gitignored):
//
//   VITE_TELEGRAM_ID=123456789   # sign in locally as this Telegram user
//   VITE_USE_EMULATORS=true      # talk to the local Firebase emulator suite
//
// The client then sends that raw id instead of initData, and the Functions
// emulator mints a normal custom token for it — see resolveDevTelegramUser() in
// functions/src/telegramAuth.ts. The role (user/admin) still comes from the
// server-side ADMIN_TELEGRAM_IDS whitelist, so local dev matches Telegram.
//
// Everything here is gated on import.meta.env.DEV, which Vite replaces with
// `false` in a production build, so there is no usable bypass when deployed.

/** Telegram id from VITE_TELEGRAM_ID, or null when unset or not a valid id. */
function parseTelegramId(value: string | undefined): number | null {
  const id = Number.parseInt((value ?? '').trim(), 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

const rawDevTelegramId: string | undefined = import.meta.env.VITE_TELEGRAM_ID
const DEV_TELEGRAM_ID = parseTelegramId(rawDevTelegramId)

/**
 * The Telegram id to sign in as during `npm run dev`, or null when dev login is
 * off: production build, VITE_TELEGRAM_ID not set, or the emulator suite not
 * selected. The bypass only exists in the Functions emulator, so without
 * VITE_USE_EMULATORS the id would be rejected by the deployed function — in
 * that case the app offers the Telegram bot link instead.
 */
export function getDevTelegramId(): number | null {
  if (!import.meta.env.DEV) return null
  if (!shouldUseEmulators()) return null
  return DEV_TELEGRAM_ID
}

/** True when the client should use the local emulator suite instead of cloud. */
export function shouldUseEmulators(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true'
}
