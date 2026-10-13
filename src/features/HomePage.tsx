// UI-02 + UI-04 — Home screen: logo, sky, floor, and exactly ONE call to
// action that follows from where the player opened the app:
//
//   * plain browser (no Telegram initData, no way to sign in)
//        → "Open Telegram Bot": the deep link opens the Mini App, where
//          sign-in does work.
//   * inside Telegram, not signed in yet
//        → "Sign in with Telegram" (plus the status/error line from App).
//   * signed in
//        → "▶ Play" only. The bot/sign-in buttons would be noise by then, so
//          they disappear; the nav bar covers every other screen.
//
// The top-right settings button (text-only for now — icons come later) opens a
// menu towards the left with Music / Sound effects switches and an Info entry
// that navigates to the "How to play" tutorial screen.
//
// The background/skin/ground switchers live on the Profile screen (UI-04);
// Home just renders whatever is stored — the sky via useBackgroundIndex and
// the floor via useGroundIndex (both shared through localStorage events).
// Sign-in state and flow live in App.tsx and arrive as props.
import { useEffect, useRef, useState } from 'react'
import type { TelegramSignInResult } from '../auth'
import { getDevTelegramId } from '../devAuth'
import { backgrounds, logo } from '../sprites'
import { useBackgroundIndex } from './homeBackground'
import { useGroundIndex } from './groundTile'
import { groundUrls } from '../sprites'
import {
  getTelegramBotLink,
  getTelegramUser,
  isTelegramEnvironment,
} from '../telegram'
import { useSoundSettings } from './soundSettings'
import type { Screen } from '../navigation'
import '../App.css'

interface HomePageProps {
  /** The live Firebase session uid (null = guest), observed by App. */
  signedInUid: string | null
  /** Role from useAuthRole, so Home can show the Admin shortcut too. */
  role: 'user' | 'admin' | null
  /** Sign-in outcome state owned by App (status line + result). */
  session: TelegramSignInResult | null
  authStatus: string
  onSignIn: () => void
  onOpenGame: () => void
  onNavigate: (screen: Screen) => void
}

/**
 * Home's settings button (top-right) + its dropdown. Text labels only for
 * now: "Music: On", "Sound effects: Off", "Info" — icons are a later pass, so
 * the state lives in the label itself. The menu extends to the LEFT of the
 * button (the button sits in the corner), and closes on outside click, on
 * Escape and whenever an entry is chosen.
 */
function SettingsMenu({ onOpenTutorial }: { onOpenTutorial: () => void }) {
  const [open, setOpen] = useState(false)
  const { music, sfx, toggleMusic, toggleSfx } = useSoundSettings()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="settings" ref={rootRef}>
      <button
        type="button"
        className="settings-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Settings
      </button>

      {open && (
        <div className="settings-menu" role="menu" aria-label="Settings">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={music}
            className="settings-item"
            onClick={toggleMusic}
          >
            Music: {music ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={sfx}
            className="settings-item"
            onClick={toggleSfx}
          >
            Sound effects: {sfx ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="settings-item"
            onClick={() => {
              setOpen(false)
              onOpenTutorial()
            }}
          >
            Info
          </button>
        </div>
      )}
    </div>
  )
}

export function HomePage({
  signedInUid,
  role,
  session,
  authStatus,
  onSignIn,
  onOpenGame,
  onNavigate,
}: HomePageProps) {
  // Index into the sky tiles in src/sprites.ts (UI-07: background switcher,
  // shared with the Game canvas via homeBackground.ts).
  const [backgroundIndex] = useBackgroundIndex(backgrounds.length)
  // Ground strip shown by the floor (Profile's ground switcher, UI-04).
  const [groundIndex] = useGroundIndex()
  const inTelegram = isTelegramEnvironment()
  const tgUser = getTelegramUser()
  // DEV-ONLY (src/devAuth.ts): set VITE_TELEGRAM_ID in .env to sign in locally.
  const devTelegramId = getDevTelegramId()

  const signedIn = signedInUid !== null
  // Is a sign-in possible from here at all? Inside Telegram initData does the
  // job; outside it only the DEV login can, so a plain browser visitor (no
  // Telegram, no VITE_TELEGRAM_ID) gets the bot link instead of a button that
  // would fail.
  const canSignIn = inTelegram || devTelegramId !== null

  return (
    <main className="page">
      <div
        className="sky"
        style={{ backgroundImage: `url(${backgrounds[backgroundIndex]})` }}
        aria-hidden="true"
      />

      <SettingsMenu onOpenTutorial={() => onNavigate('tutorial')} />

      <div className="content">
        <img className="logo logo-float" src={logo} alt="Bird Energy" />
        <p className="hello">
          Hello, {session?.user.firstName ?? tgUser?.first_name ?? 'player'}!
        </p>

        {!signedIn && devTelegramId !== null && (
          <p className="auth-status">
            DEV login: Telegram id {devTelegramId} via the Functions emulator
          </p>
        )}

        <div className="home-actions">
          {signedIn ? (
            /* Signed in: Play is the only action that still makes sense. */
            <>
              <button type="button" className="btn" onClick={onOpenGame}>
                ▶ Play
              </button>
              {role === 'admin' && (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => onNavigate('admin')}
                >
                  Admin Panel
                </button>
              )}
            </>
          ) : canSignIn ? (
            /* Inside Telegram (or DEV login): the one thing left is signing in. */
            <>
              <button type="button" className="btn" onClick={onSignIn}>
                Sign in with Telegram
              </button>
              {authStatus && <p className="auth-status">{authStatus}</p>}
            </>
          ) : (
            /* Plain browser: no initData to sign in with, so point the visitor
               at the bot, which opens the Mini App properly. */
            <a className="btn" href={getTelegramBotLink()}>
              Open Telegram Bot
            </a>
          )}
        </div>
      </div>
      <div
        className="floor"
        style={{ backgroundImage: `url(${groundUrls[groundIndex]})` }}
        aria-hidden="true"
      />
    </main>
  )
}
