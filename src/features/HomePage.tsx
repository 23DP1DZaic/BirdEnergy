// UI-02 — Home screen: the hello page (logo, sky, floor, background switcher,
// Telegram sign-in) plus a Play button that opens the Game screen.
// The floating logo animation lives in .logo-float (see App.css).
// Sign-in state and flow live in App.tsx and arrive as props.
import type { TelegramSignInResult } from '../auth'
import { getDevTelegramId } from '../devAuth'
import { backgrounds, logo } from '../sprites'
import { useBackgroundIndex } from './homeBackground'
import {
  getTelegramBotLink,
  getTelegramUser,
  isTelegramEnvironment,
  telegramBotUsername,
} from '../telegram'
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
  onNavigate: (
    screen: 'leaderboard' | 'challenges' | 'profile' | 'admin',
  ) => void
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
  const [backgroundIndex, cycleBackground] = useBackgroundIndex(
    backgrounds.length,
  )
  const inTelegram = isTelegramEnvironment()
  const tgUser = getTelegramUser()
  // DEV-ONLY (src/devAuth.ts): set VITE_TELEGRAM_ID in .env to sign in locally.
  const devTelegramId = getDevTelegramId()

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
        onClick={cycleBackground}
      >
        Background {backgroundIndex + 1}/{backgrounds.length}
      </button>

      <div className="content">
        <img className="logo logo-float" src={logo} alt="Bird Energy" />
        <p className="hello">
          Hello, {session?.user.firstName ?? tgUser?.first_name ?? 'player'}!
        </p>

        {devTelegramId !== null && (
          <p className="auth-status">
            DEV login: Telegram id {devTelegramId} via the Functions emulator
          </p>
        )}

        <div className="home-actions">
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
        </div>

        {(inTelegram || devTelegramId !== null) && (
          <div className="auth">
            <button type="button" className="btn" onClick={onSignIn}>
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
