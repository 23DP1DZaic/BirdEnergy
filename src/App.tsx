// UI-02 — app shell: screen state, sign-in flow, role-aware navigation,
// guarded routes.
//
// Layout: one bottom nav on every screen size (the spec's desktop top bar was
// dropped by preference); the Admin link renders only for the admin role.
// React Router is deliberately not used — the spec allows a small route
// structure, so the active screen is plain state. The sign-in flow lives here
// (click handlers, not effects) so any guarded screen can reuse it.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  observeAuthSession,
  signInWithTelegram,
  type TelegramSignInResult,
} from './auth'
import { getDevTelegramId, shouldUseEmulators } from './devAuth'
import { isTelegramEnvironment, telegramBotUsername } from './telegram'
import { NAV_ITEMS, type Screen } from './navigation.ts'
import { useAuthRole } from './useAuthRole.ts'
import type { GamePhase } from './features/game/engine'
import { AdminPage } from './features/AdminPage.tsx'
import { ChallengesPage } from './features/ChallengesPage.tsx'
import { GamePage } from './features/GamePage.tsx'
import { HomePage } from './features/HomePage.tsx'
import { LeaderboardPage } from './features/LeaderboardPage.tsx'
import { ProfilePage } from './features/ProfilePage.tsx'
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

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  // AUTH-03: reflect the live Firebase session (survives page reloads).
  const [signedInUid, setSignedInUid] = useState<string | null>(null)
  // Sign-in flow state (moved from the old hello page so guarded screens can
  // trigger the same flow).
  const [authStatus, setAuthStatus] = useState('')
  const [session, setSession] = useState<TelegramSignInResult | null>(null)
  // Game-screen phase, reported by the canvas: the nav bars are removed from
  // the layout only while a run is actively in progress (see navHidden).
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready')

  useEffect(() => observeAuthSession(setSignedInUid), [])

  const role = useAuthRole(signedInUid)
  const inTelegram = isTelegramEnvironment()

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

  // Local dev convenience (AUTH-04/DOC-03): sign in straight away, once, when
  // VITE_TELEGRAM_ID is configured; the ref keeps StrictMode's double mount
  // to one call. Click-driven elsewhere — no setState-in-effect lint issue.
  const autoSignInStarted = useRef(false)
  useEffect(() => {
    if (getDevTelegramId() === null || autoSignInStarted.current) return
    autoSignInStarted.current = true
    void handleSignIn()
  }, [handleSignIn])

  // Sign-in attempts from guarded screens land on Home, where the status line
  // (signing in / success / failure) is visible.
  const requestSignIn = useCallback(() => {
    navigate('home')
    void handleSignIn()
  }, [handleSignIn])

  // All navigation goes through here: leaving the game screen also clears any
  // stale in-progress phase, because the canvas reports phases only while it
  // is mounted.
  function navigate(next: Screen) {
    setScreen(next)
    if (next !== 'game') setGamePhase('ready')
  }

  const renderScreen = () => {
    switch (screen) {
      case 'home':
        return (
          <HomePage
            signedInUid={signedInUid}
            role={role}
            session={session}
            authStatus={authStatus}
            onSignIn={requestSignIn}
            onOpenGame={() => navigate('game')}
            onNavigate={navigate}
          />
        )
      case 'game':
        return (
          <GamePage
            signedInUid={signedInUid}
            onSignIn={requestSignIn}
            onDecline={() => navigate('home')}
            onPhaseChange={setGamePhase}
          />
        )
      case 'leaderboard':
        return <LeaderboardPage />
      case 'challenges':
        return <ChallengesPage />
      case 'profile':
        return <ProfilePage signedInUid={signedInUid} />
      case 'admin':
        return role === 'admin' ? <AdminPage /> : null
    }
  }

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.adminOnly || role === 'admin',
  )

  // Active gameplay only: the nav bars are conditionally REMOVED (not made
  // transparent) so the run uses the full vertical space. They come back on
  // the ready screen, the game-over/result state and every other screen.
  const navHidden = screen === 'game' && gamePhase === 'playing'

  return (
    <div className="shell">
      <div className="screen-area">{renderScreen()}</div>

      {!navHidden && (
        <nav className="bottomnav" aria-label="Main">
          {visibleNav.map((item) => (
            <button
              key={item.screen}
              type="button"
              className={`navlink${screen === item.screen ? ' navlink-active' : ''}`}
              aria-current={screen === item.screen ? 'page' : undefined}
              onClick={() => navigate(item.screen)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

export default App
