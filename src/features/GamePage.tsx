// UI-02 guard + GAME-01 — Game screen: real canvas game for signed-in users.
// Guests see an actionable sign-in notice instead of the game.
//
// DATA-01 — consent gate: before the game starts, a signed-in user without a
// users/{uid} profile sees "Is it OK to use your data for the game and show
// your name on the leaderboard?". Accepting calls the acceptDataProcessing
// Cloud Function (creates the Firestore doc), then the game mounts. The
// profile is only re-checked when the uid changes, so navigating away and
// back doesn't re-read Firestore on every visit.
import { useEffect, useState } from 'react'
import type { GamePhase } from './game/engine'
import { GameCanvas } from './game/GameCanvas'
import { PlaceholderPage } from './PlaceholderPage'
import {
  acceptDataProcessing,
  checkProfileConsent,
  type ProfileCheck,
} from './userProfile'

interface GamePageProps {
  signedInUid: string | null
  onSignIn: () => void
  /** Declined consent → leave the Game screen (App navigates Home). */
  onDecline: () => void
  /** Reported by the canvas so the shell can hide the nav during play. */
  onPhaseChange?: (phase: GamePhase) => void
}

export function GamePage({
  signedInUid,
  onSignIn,
  onDecline,
  onPhaseChange,
}: GamePageProps) {
  const [profile, setProfile] = useState<ProfileCheck | null>(null)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentError, setConsentError] = useState('')

  useEffect(() => {
    if (!signedInUid) return
    let cancelled = false
    // profile stays null while checking → "Checking your player profile…".
    checkProfileConsent(signedInUid).then((result) => {
      if (!cancelled) setProfile(result)
    })
    return () => {
      cancelled = true
    }
  }, [signedInUid])

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

  // Profile check in flight (initial state `null`): show nothing yet.
  if (profile === null) {
    return (
      <PlaceholderPage card="GAME-01">
        <p className="guard-text">Checking your player profile…</p>
      </PlaceholderPage>
    )
  }

  if (profile.kind === 'error') {
    return (
      <PlaceholderPage card="GAME-01">
        <div className="guard">
          <p className="guard-text">
            Could not load your player profile: {profile.message}
          </p>
        </div>
      </PlaceholderPage>
    )
  }

  if (profile.kind === 'needs-consent') {
    const accept = async () => {
      setConsentBusy(true)
      setConsentError('')
      try {
        await acceptDataProcessing()
        // Re-read: the function upserted users/{uid}, so this flips to 'consented'.
        const result = await checkProfileConsent(signedInUid)
        setProfile(result)
      } catch (err) {
        setConsentError(
          err instanceof Error ? err.message : String(err),
        )
      } finally {
        setConsentBusy(false)
      }
    }
    return (
      <PlaceholderPage card="GAME-01">
        <div className="consent">
          <h2 className="consent-title">Before you play</h2>
          <p className="consent-text">
            Is it okay to use your Telegram data for the game — your name on
            the leaderboard and your scores in your profile?
          </p>
          <p className="consent-text consent-fineprint">
            We store your Telegram id and username only to identify your
            scores. Nothing is shared publicly except the name you see on the
            leaderboard.
          </p>
          {consentError && (
            <p className="consent-error" role="alert">
              {consentError}
            </p>
          )}
          <div className="consent-actions">
            <button
              type="button"
              className="btn"
              onClick={accept}
              disabled={consentBusy}
            >
              {consentBusy ? 'Saving…' : 'Agree and play'}
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={onDecline}
              disabled={consentBusy}
            >
              No thanks
            </button>
          </div>
        </div>
      </PlaceholderPage>
    )
  }

  return <GameCanvas onPhaseChange={onPhaseChange} />
}
