// UI-02 + UI-04 — Home screen: logo, sky, floor, and exactly ONE call to
// action that follows from where the player opened the app:
//
//   * plain browser (no Telegram initData, no way to sign in)
//        → "Open Telegram Bot": the deep link opens the Mini App, where
//          sign-in does work.
//   * inside Telegram, not signed in yet
//        → "Sign in with Telegram" (plus the status/error line from App).
//   * signed in
//        → tapping ANYWHERE on Home starts a run; the screen shows a big
//          play-key (the sprite sheet's arrow cell — no word) instead of a
//          text button. There is no Play entry in the bottom nav any more,
//          so this is the way into the game. The key is a real button so
//          keyboard users keep a path in, and the controls that are still on
//          the screen (settings, admin) opt out of the page tap.
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
import { useHapticsSetting } from './haptics'
import { PixelIcon } from './ui/PixelIcon'
import { LOCALES, LOCALE_LABEL, setLocale, useT } from '../i18n'
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
 * Home's settings button (top-right) + its dropdown.
 *
 * The trigger is the gear SPRITE alone — no word — so the corner stays quiet.
 * The menu opens with the three things worth one tap (music, sound effects,
 * info) as icon buttons from the shared sheet; the two settings the sheet has
 * no symbol for (vibration, language) stay as text rows underneath. State is
 * carried by aria-checked (and the sound icon itself swaps), so the buttons do
 * not need labels on screen.
 */
function SettingsMenu({
  open,
  setOpen,
  onOpenTutorial,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  onOpenTutorial: () => void
}) {
  const { t, locale } = useT()
  const { music, sfx, toggleMusic, toggleSfx } = useSoundSettings()
  const {
    haptics,
    supported: hapticsSupported,
    toggleHaptics,
  } = useHapticsSetting()
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
  }, [open, setOpen])

  return (
    <div className="settings" ref={rootRef}>
      <button
        type="button"
        className="settings-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('home.settings')}
        title={t('home.settings')}
        onClick={() => setOpen(!open)}
      >
        <PixelIcon name="settings" size={34} pressed={open} />
      </button>

      {open && (
        <div
          className="settings-menu"
          role="menu"
          aria-label={t('home.settings')}
        >
          <div className="settings-icons">
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={music}
              className="settings-icon-button"
              aria-label={t('home.music', {
                state: t(music ? 'state.on' : 'state.off'),
              })}
              title={t('home.music', {
                state: t(music ? 'state.on' : 'state.off'),
              })}
              onClick={toggleMusic}
            >
              <PixelIcon name={music ? 'music' : 'musicOff'} size={30} />
            </button>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={sfx}
              className="settings-icon-button"
              aria-label={t('home.sfx', {
                state: t(sfx ? 'state.on' : 'state.off'),
              })}
              title={t('home.sfx', {
                state: t(sfx ? 'state.on' : 'state.off'),
              })}
              onClick={toggleSfx}
            >
              <PixelIcon
                name={sfx ? 'soundOn' : 'soundOff'}
                size={30}
              />
            </button>
            <button
              type="button"
              role="menuitem"
              className="settings-icon-button"
              aria-label={t('home.info')}
              title={t('home.info')}
              onClick={() => {
                setOpen(false)
                onOpenTutorial()
              }}
            >
              <PixelIcon name="info" size={30} />
            </button>
          </div>
          {/* Haptics only shows where the device can vibrate — a switch that
              can never do anything is worse than no switch. */}
          {hapticsSupported && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={haptics}
              className="settings-item"
              onClick={toggleHaptics}
            >
              {t('home.haptics', {
                state: t(haptics ? 'state.on' : 'state.off'),
              })}
            </button>
          )}
          {/* i18n — one tap cycles the language; the choice is remembered. */}
          <button
            type="button"
            role="menuitem"
            className="settings-item"
            onClick={() =>
              setLocale(LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length])
            }
          >
            {t('home.language', { name: LOCALE_LABEL[locale] })}
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
  const { t } = useT()
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
  // The settings menu is owned here so a tap meant to dismiss it cannot also
  // start a run (see the page onClick below).
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Is a sign-in possible from here at all? Inside Telegram initData does the
  // job; outside it only the DEV login can, so a plain browser visitor (no
  // Telegram, no VITE_TELEGRAM_ID) gets the bot link instead of a button that
  // would fail.
  const canSignIn = inTelegram || devTelegramId !== null

  return (
    <main
      className={signedIn ? 'page page-playable' : 'page'}
      onClick={(event) => {
        // Signed-out Home keeps its explicit sign-in / bot action; the tap-to-
        // play line is a button, so keyboard users start a run too.
        if (!signedIn || settingsOpen) return
        // Real controls on the page keep their own behaviour.
        if (
          event.target instanceof Element &&
          event.target.closest('button, a, input, select, textarea')
        ) {
          return
        }
        onOpenGame()
      }}
    >
      <div
        className="sky"
        style={{ backgroundImage: `url(${backgrounds[backgroundIndex]})` }}
        aria-hidden="true"
      />

      <SettingsMenu
        open={settingsOpen}
        setOpen={setSettingsOpen}
        onOpenTutorial={() => onNavigate('tutorial')}
      />

      <div className="content">
        <img className="logo logo-float" src={logo} alt="Bird Energy" />
        <p className="hello">
          {t('home.hello', {
            name:
              session?.user.firstName ?? tgUser?.first_name ?? t('profile.player'),
          })}
        </p>

        {!signedIn && devTelegramId !== null && (
          <p className="auth-status">
            {t('home.devLogin', { id: devTelegramId })}
          </p>
        )}

        <div className="home-actions">
          {signedIn ? (
            /* Signed in: the whole screen is the play control; this key only
               names it (and keeps a keyboard-reachable button). The arrow
               sprite IS the button — no "TAP TO PLAY" word on screen. */
            <>
              <button
                type="button"
                className="tap-to-play"
                aria-label={t('home.tapToPlay')}
                title={t('home.tapToPlay')}
                onClick={onOpenGame}
              >
                <PixelIcon name="play" size={64} />
              </button>
              {role === 'admin' && (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => onNavigate('admin')}
                >
                  {t('nav.admin')}
                </button>
              )}
            </>
          ) : canSignIn ? (
            /* Inside Telegram (or DEV login): the one thing left is signing in. */
            <>
              <button type="button" className="btn" onClick={onSignIn}>
                {t('sign.signIn')}
              </button>
              {authStatus && <p className="auth-status">{authStatus}</p>}
            </>
          ) : (
            /* Plain browser: no initData to sign in with, so point the visitor
               at the bot, which opens the Mini App properly. */
            <a className="btn" href={getTelegramBotLink()}>
              {t('home.openBot')}
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
