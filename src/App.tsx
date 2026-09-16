import { useCallback, useEffect, useRef, useState } from 'react'
import { observeAuthSession, signInWithTelegram, type TelegramSignInResult } from './auth'
import { getDevTelegramId, shouldUseEmulators } from './devAuth'
import { backgrounds, logo } from './sprites'
import {
  getTelegramBotLink,
  getTelegramUser,
  isTelegramEnvironment,
  telegramBotUsername,
} from './telegram'
import './App.css'

/**
 * Turns a failed sign-in into something actionable: in a browser the usual
 * cause is the local emulator suite not running (ERR_CONNECTION_REFUSED on the
 * Functions port), which the raw Firebase error does not explain.
 */
function describeSignInError(err: unknown, inTelegram: boolean): string {
  const detail = err instanceof Error ? err.message : String(err)
  if (!inTelegram && shouldUseEmulators()) {
    return `${detail} — are the local emulators running? Start them with "npx firebase-tools emulators:start --only auth,firestore,functions --project birdenergy-f1405", or open the app via @${telegramBotUsername}.`
  }
  return detail
}

/**
 * UI-02/UI-03: hello page — pixel-art logo, switchable sky and a tiled ground
 * floor from the asset pack (see src/sprites.ts).
 * Responsive: fluid type via clamp(), floor strip pinned to the bottom at its
 * native tile size, background covers the viewport on any aspect ratio.
 *
 * Outside Telegram (where no signed initData exists) the page offers the bot
 * link instead of a sign-in that cannot work.
 */
function App() {
  const [authStatus, setAuthStatus] = useState('')
  const [session, setSession] = useState<TelegramSignInResult | null>(null)
  const [signedInUid, setSignedInUid] = useState<string | null>(null)
  // Index into the sky tiles in src/sprites.ts (UI-03: background switcher).
  const [backgroundIndex, setBackgroundIndex] = useState(0)
  const inTelegram = isTelegramEnvironment()
  const tgUser = getTelegramUser()
  // DEV-ONLY (src/devAuth.ts): set VITE_TELEGRAM_ID in .env to sign in locally.
  const devTelegramId = getDevTelegramId()
  const autoSignInStarted = useRef(false)

  // AUTH-03: reflect the live Firebase session (survives page reloads).
  useEffect(() => observeAuthSession(setSignedInUid), [])

  const handleSignIn = useCallback(async () => {
    setAuthStatus('Signing in…')
    try {
      const result = await signInWithTelegram()
      setSession(result)
      setAuthStatus(
        `Signed in: role=${result.role} id=${result.user.telegramId} @${result.user.username ?? '—'}`,
      )
    } catch (err) {
      setAuthStatus(`Failed: ${describeSignInError(err, inTelegram)}`)
    }
  }, [inTelegram])

  const handleChangeBackground = () =>
    setBackgroundIndex((index) => (index + 1) % backgrounds.length)

  // Local dev convenience: sign in straight away, once, when VITE_TELEGRAM_ID
  // is configured (the ref keeps React StrictMode's double mount to one call).
  useEffect(() => {
    if (devTelegramId === null || autoSignInStarted.current) return
    autoSignInStarted.current = true
    void handleSignIn()
  }, [devTelegramId, handleSignIn])

  return (
    <main className="page">
      <div
        className="sky"
        style={{ backgroundImage: `url(${backgrounds[backgroundIndex]})` }}
        aria-hidden="true"
      />

      <button
        type="button"
        className="btn bg-toggle"
        onClick={handleChangeBackground}
      >
        Background {backgroundIndex + 1}/{backgrounds.length}
      </button>

      <div className="content">
        <img className="logo" src={logo} alt="Bird Energy" />
        <p className="hello">
          Hello, {session?.user.firstName ?? tgUser?.first_name ?? 'player'}!
        </p>

        {devTelegramId !== null && (
          <p className="auth-status">
            DEV login: Telegram id {devTelegramId} via the Functions emulator
          </p>
        )}

        {(inTelegram || devTelegramId !== null) && (
          <div className="auth">
            <button type="button" className="btn" onClick={handleSignIn}>
              Sign in with Telegram
            </button>
            {authStatus && <p className="auth-status">{authStatus}</p>}
            {signedInUid && (
              <p className="auth-status">
                Session active ({signedInUid})
                {session ? ` — role: ${session.role}` : ''}
              </p>
            )}
          </div>
        )}

        {/* Outside Telegram there is no initData to sign in with, so point the
            visitor at the bot, which opens the Mini App properly. */}
        {!inTelegram && (
          <a className="btn" href={getTelegramBotLink()}>
            Open @{telegramBotUsername}
          </a>
        )}
      </div>
      <div className="floor" aria-hidden="true" />
    </main>
  )
}

export default App
