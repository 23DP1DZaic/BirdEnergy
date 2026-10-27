// GAME-01 — "share my score", one place, three layers of fallback.
//
// The button used to try `navigator.share` and then the clipboard, which is
// why it did nothing inside Telegram: most of its webviews expose neither (or
// reject the call without asking). The order is now:
//
//   1. Telegram's own share picker (`openTelegramLink` + t.me/share) — always
//      available where the app actually runs;
//   2. the Web Share API — real browsers, iOS/Android home-screen installs;
//   3. the clipboard, modern API first and then the legacy `execCommand`
//      path, which is the only one older webviews allow.
//
// Every step reports WHAT happened instead of throwing, so the button can tell
// the player ("Link copied!") instead of failing silently. Closing a share
// sheet is 'cancelled', not a failure.
import { getTelegramBotLink, openTelegramShare } from '../telegram'

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Copies text with the legacy selection trick. Returns false when even that
 * is unavailable (no DOM, or the browser refuses the command).
 */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const area = document.createElement('textarea')
  area.value = text
  // Off-screen but still focusable: `display: none` cannot be selected.
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  try {
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(area)
  }
}

/**
 * Shares `text` together with the bot link. `title` is used by the native
 * share sheet only; Telegram builds its own message from the text.
 */
export async function shareScore(
  title: string,
  text: string,
): Promise<ShareOutcome> {
  const link = getTelegramBotLink()
  const message = `${text} ${link}`

  // 1. Inside Telegram the client shares for us.
  if (openTelegramShare(text)) return 'shared'

  // 2. Native sheet (Safari/Chrome on phones, desktop browsers that have it).
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url: link })
      return 'shared'
    } catch (err) {
      // The player dismissed the sheet — that is a normal outcome, not an
      // error worth a red "could not share" label.
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
      console.warn('[share] native sheet failed, falling back', err)
    }
  }

  // 3. Clipboard: the async API needs a secure context + permission, so the
  //    legacy path stays as the last resort instead of a dead end.
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(message)
      return 'copied'
    } catch (err) {
      console.warn('[share] clipboard write failed, trying legacy copy', err)
    }
  }
  if (legacyCopy(message)) return 'copied'

  return 'failed'
}
