import { useEffect, useState } from 'react'
import { observeAuthSession, signInWithTelegram, type TelegramSignInResult } from './auth'
import { getTelegramUser, isTelegramEnvironment } from './telegram'
import './App.css'

/**
 * UI-02: basic hello page — background + grass floor from the asset pack.
 * Responsive: fluid type via clamp(), floor strip pinned to the bottom,
 * background covers the viewport (center-weighted crop on any aspect ratio).
 */
function App() {
  const [authStatus, setAuthStatus] = useState('')
  const [session, setSession] = useState<TelegramSignInResult | null>(null)
  const [signedInUid, setSignedInUid] = useState<string | null>(null)
  const inTelegram = isTelegramEnvironment()
  const tgUser = getTelegramUser()

  // AUTH-03: reflect the live Firebase session (survives page reloads).
  useEffect(() => observeAuthSession(setSignedInUid), [])

  const handleSignIn = async () => {
    setAuthStatus('Signing in…')
    try {
      const result = await signInWithTelegram()
      setSession(result)
      setAuthStatus(
        `Signed in: role=${result.role} id=${result.user.telegramId} @${result.user.username ?? '—'}`,
      )
    } catch (err) {
      setAuthStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <main className="page">
      <div className="sky" aria-hidden="true" />
      <div className="content">
        <h1 className="title">
          Bird
          <br />
          Energy
        </h1>
        <p className="hello">Hello, {tgUser?.first_name ?? 'player'}!</p>

        {inTelegram && (
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
      </div>
      <div className="floor" aria-hidden="true" />
    </main>
  )
}

export default App
