// UI-02 guard + GAME-01 — Game screen: real canvas game for signed-in users.
// Guests see an actionable sign-in notice instead of the game.
import type { GamePhase } from './game/engine'
import { GameCanvas } from './game/GameCanvas'
import { PlaceholderPage } from './PlaceholderPage'

interface GamePageProps {
  signedInUid: string | null
  onSignIn: () => void
  /** Reported by the canvas so the shell can hide the nav during play. */
  onPhaseChange?: (phase: GamePhase) => void
}

export function GamePage({
  signedInUid,
  onSignIn,
  onPhaseChange,
}: GamePageProps) {
  if (!signedInUid) {
    return (
      <PlaceholderPage card="GAME-01">
        <div className="guard">
          <p className="guard-text">
            Playing needs a Telegram session. Sign in from the Home screen
            (inside Telegram, or with the dev login).
          </p>
          <button type="button" className="btn" onClick={onSignIn}>
            Sign in with Telegram
          </button>
        </div>
      </PlaceholderPage>
    )
  }
  return <GameCanvas onPhaseChange={onPhaseChange} />
}
