// DATA-01 — the consent shown BEFORE the first Telegram sign-in.
//
// The sign-in call already sends acceptDataProcessing, and the server asks
// again only when an account has no stored consent. This flag is the client
// half: the player reads what Telegram data the game uses and ticks the box
// once on this device, so the notice is not shown on every visit.
//
// Storage failures (private mode, disabled storage) are ignored: the screen
// then simply appears again, which is the safe direction — never the reverse.

const STORAGE_KEY = 'birdenergy.dataConsent.v1'

/** True when this device already confirmed the data-processing notice. */
export function hasDataConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Remembers the confirmation so the notice is not repeated on this device. */
export function rememberDataConsent(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Ignored on purpose — see the file comment.
  }
}
