// UI-02 guard + GAME-01 — Game screen: real canvas game for signed-in users.
// Guests see an actionable sign-in notice instead of the game.
//
// DATA-01 — consent gate: before the game starts, a signed-in user without a
// users/{uid} profile sees "Is it OK to use your data for the game and show
// your name on the leaderboard?". Accepting calls the acceptDataProcessing
// Cloud Function (creates the Firestore doc), then the game mounts. The
// profile is only re-checked when the uid changes, so navigating away and
// back doesn't re-read Firestore on every visit.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameChallengeView, GamePhase, RunResult } from './game/engine'
import { GameCanvas } from './game/GameCanvas'
import { PlaceholderPage } from './PlaceholderPage'
import {
  computeProgress,
  deriveStatus,
  fetchChallenges,
  fetchMyGameResults,
  type Challenge,
  type GameRun,
} from './challenges'
import {
  acceptDataProcessing,
  checkProfileConsent,
  type ProfileCheck,
} from './userProfile'
// E — finished runs go through the offline queue, so a network blip can never
// lose a score: a failed submit is replayed once the connection is back.
import { flushPendingRuns, submitRun } from './pendingRuns'
import { useT } from '../i18n'

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
  const { t } = useT()
  const [profile, setProfile] = useState<ProfileCheck | null>(null)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentError, setConsentError] = useState('')
  // C — what the Game Over panel shows: the real (server) personal best and
  // the active challenge's progress, resolved once per visit.
  const [submittedBest, setSubmittedBest] = useState<number | null>(null)
  const [challengeView, setChallengeView] = useState<GameChallengeView | null>(
    null,
  )
  const challengeRef = useRef<{ challenge: Challenge; runs: GameRun[] } | null>(
    null,
  )

  // C — advance the active challenge with the run that just ended. The runs
  // list is already in memory, so the new progress shows instantly and costs
  // no extra reads.
  const advanceChallenge = useCallback((run: RunResult) => {
    const pending = challengeRef.current
    if (!pending) return
    const runs = [...pending.runs, { score: run.score, createdAt: new Date() }]
    pending.runs = runs
    // celebrate stays false on purpose: the engine detects the crossing
    // (value < target -> value >= target) itself, as a one-shot (syncChallenge).
    setChallengeView({
      id: pending.challenge.id,
      title: pending.challenge.title,
      value: computeProgress(pending.challenge, runs).value,
      target: pending.challenge.targetValue,
      celebrate: false,
      celebrateAt: 0,
    })
  }, [])

  // Stable identity so GameCanvas's engine effect never re-runs (which would
  // reset the game) — DATA-01: persist every finished run. Failures (offline,
  // validation) must never disturb the game-over screen; they surface in console.
  // Declared before the early returns: hooks must run on every render.
  // C — the server response replaces the personal best; the challenge progress
  // advances locally right away (see handleRunEnd).
  const handleRunEnd = useCallback(
    (run: RunResult) => {
      // The progress block is pure local math over the runs already in
      // memory — advance it NOW so the panel shows this run's contribution
      // instantly, even offline (the queued run is replayed later and the
      // server-side numbers converge).
      advanceChallenge(run)
      // submitRun never rejects: a failure is queued (see pendingRuns.ts),
      // and only a real server response replaces the personal best.
      void submitRun(run).then((response) => {
        if (!response) return
        setSubmittedBest(response.bestScore)
      })
    },
    [advanceChallenge],
  )

  // E — any runs that could not be submitted last time are replayed as soon as
  // there is a session to authenticate with.
  useEffect(() => {
    void flushPendingRuns()
  }, [signedInUid])

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

  // C — the active challenge (if one is running), measured against this
  // player's runs, plus the personal best from the profile DATA-01 loaded.
  // Decorative: a failure here must never stop someone from playing.
  useEffect(() => {
    if (!signedInUid || profile === null || profile.kind !== 'consented') return
    let cancelled = false
    Promise.all([fetchChallenges(), fetchMyGameResults(signedInUid)])
      .then(([challenges, runs]) => {
        if (cancelled) return
        const now = new Date()
        const active =
          challenges.find((c) => deriveStatus(c, now) === 'active') ?? null
        if (!active) return
        challengeRef.current = { challenge: active, runs }
        setChallengeView({
          id: active.id,
          title: active.title,
          value: computeProgress(active, runs).value,
          target: active.targetValue,
          celebrate: false,
          celebrateAt: 0,
        })
      })
      .catch((err: unknown) => {
        console.warn('challenge progress unavailable', err)
      })
    return () => {
      cancelled = true
    }
  }, [signedInUid, profile])

  // C — the personal best the panel shows: the latest submitted run's result
  // as soon as there is one, otherwise the stored best from the profile.
  const serverBest =
    submittedBest ??
    (profile !== null && profile.kind === 'consented'
      ? profile.profile.bestScore ?? 0
      : 0)

  if (!signedInUid) {
    return (
      <PlaceholderPage card="GAME-01">
        <div className="guard">
          <p className="guard-text">{t('game.guard')}</p>
          <button type="button" className="btn" onClick={onSignIn}>
            {t('sign.signIn')}
          </button>
        </div>
      </PlaceholderPage>
    )
  }

  // Profile check in flight (initial state `null`): show nothing yet.
  if (profile === null) {
    return (
      <PlaceholderPage card="GAME-01">
        <p className="guard-text">{t('game.checking')}</p>
      </PlaceholderPage>
    )
  }

  if (profile.kind === 'error') {
    return (
      <PlaceholderPage card="GAME-01">
        <div className="guard">
          <p className="guard-text">
            {t('game.profileError', { message: profile.message })}
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
          <h2 className="consent-title">{t('game.beforeYouPlay')}</h2>
          <p className="consent-text">{t('game.consent')}</p>
          <p className="consent-text consent-fineprint">
            {t('game.consentFineprint')}
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
              {consentBusy ? t('common.saving') : t('game.agree')}
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={onDecline}
              disabled={consentBusy}
            >
              {t('game.decline')}
            </button>
          </div>
        </div>
      </PlaceholderPage>
    )
  }

  return (
    <GameCanvas
      onPhaseChange={onPhaseChange}
      onRunEnd={handleRunEnd}
      serverBest={serverBest}
      challenge={challengeView}
    />
  )
}
