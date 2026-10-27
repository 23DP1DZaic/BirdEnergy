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
  type SubmitRunResponse,
} from './userProfile'
// E — finished runs go through the offline queue, so a network blip can never
// lose a score: a failed submit is replayed once the connection is back.
// ECON-03 — the same queue keeps the attempt (and its runId) while its coin
// reward is unconfirmed, and the retry replays that exact id.
import {
  flushPendingRuns,
  newRunId,
  retryRun,
  RUNS_SAVED_EVENT,
  submitRun,
  type SavedRunDetail,
} from './pendingRuns'
import { hasDataConsent, rememberDataConsent } from './dataConsent'
import { getTelegramWebApp } from '../telegram'
import { useT } from '../i18n'

/** ECON-03 — the Game Over coin line's state. */
type RunCoinState = 'idle' | 'saving' | 'pending' | 'confirmed'

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
  // DATA-01 — the notice the player must confirm before the Telegram sign-in
  // screen is even offered. Stored per device (dataConsent.ts).
  const [dataConsentGiven, setDataConsentGiven] = useState(hasDataConsent)
  const [noticeChecked, setNoticeChecked] = useState(false)
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

  // ECON-03 — gameplay coins. The balance is SERVER-authoritative: the only
  // number shown as confirmed comes from submitGameResult's response (or a
  // queued replay of the same attempt). The HUD preview is drawn by the canvas
  // and never added here.
  const [coinState, setCoinState] = useState<RunCoinState>('idle')
  const [runCoins, setRunCoins] = useState<{
    earned: number
    balance: number
  } | null>(null)
  /** The id of the attempt the Game Over screen belongs to (retry scope). */
  const lastRunId = useRef<string | null>(null)

  const applySavedRun = useCallback((response: SubmitRunResponse) => {
    setSubmittedBest(response.bestScore)
    setRunCoins({ earned: response.coinsEarned, balance: response.coins })
    setCoinState('confirmed')
  }, [])

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
      // ECON-03 — generate the attempt id HERE and reuse it for every retry:
      // a lost save is queued under this id and replayed idempotently, so the
      // run is stored (and paid) at most once.
      const runId = newRunId()
      lastRunId.current = runId
      setRunCoins(null)
      setCoinState('saving')
      // submitRun never rejects: a failure is queued (see pendingRuns.ts),
      // and only a real server response replaces the personal best.
      void submitRun({ ...run, runId }).then((response) => {
        if (!response) {
          // Saved? not confirmed. The attempt is still on the device under the
          // same id, so this is retryable without risking a double award.
          setCoinState('pending')
          return
        }
        applySavedRun(response)
      })
    },
    [advanceChallenge, applySavedRun],
  )

  // A queued attempt can be replayed by the offline queue (online/focus,
  // another tab) after this screen already showed it as pending — the event
  // carries the response, so the reward appears without a manual retry.
  useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<SavedRunDetail>).detail
      if (!detail || detail.runId !== lastRunId.current) return
      applySavedRun(detail.response)
    }
    window.addEventListener(RUNS_SAVED_EVENT, onSaved)
    return () => window.removeEventListener(RUNS_SAVED_EVENT, onSaved)
  }, [applySavedRun])

  /** ECON-03 — explicit retry of the unconfirmed reward's attempt. */
  const retryCoins = useCallback(async () => {
    const runId = lastRunId.current
    if (!runId) return
    setCoinState('saving')
    const response = await retryRun(runId)
    if (response) applySavedRun(response)
    else setCoinState('pending')
  }, [applySavedRun])

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

  // DATA-01 — the data-processing notice comes FIRST: signing in reads the
  // Telegram profile, so the player agrees (or leaves) before that screen.
  if (!signedInUid && !dataConsentGiven) {
    const acceptNotice = () => {
      rememberDataConsent()
      setDataConsentGiven(true)
    }
    const declineNotice = () => {
      // "No" means leaving the game: inside Telegram the Mini App closes, in a
      // plain browser there is nothing to close, so it goes back to Home.
      const webApp = getTelegramWebApp()
      if (webApp && typeof webApp.close === 'function') {
        webApp.close()
        return
      }
      onDecline()
    }
    return (
      <PlaceholderPage card="GAME-01">
        <div className="consent">
          <h2 className="consent-title">{t('notice.title')}</h2>
          <p className="consent-text">{t('notice.intro')}</p>
          <ul className="consent-list">
            <li>{t('notice.itemName')}</li>
            <li>{t('notice.itemUsername')}</li>
            <li>{t('notice.itemId')}</li>
            <li>{t('notice.itemPhoto')}</li>
            <li>{t('notice.itemLanguage')}</li>
          </ul>
          <p className="consent-text consent-fineprint">
            {t('notice.fineprint')}
          </p>
          <label className="consent-check">
            <input
              type="checkbox"
              checked={noticeChecked}
              onChange={(e) => setNoticeChecked(e.target.checked)}
            />
            <span>{t('notice.checkbox')}</span>
          </label>
          <div className="consent-actions">
            <button
              type="button"
              className="btn"
              onClick={acceptNotice}
              disabled={!noticeChecked}
            >
              {t('notice.continue')}
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={declineNotice}
            >
              {t('notice.exit')}
            </button>
          </div>
        </div>
      </PlaceholderPage>
    )
  }

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
      coinState={coinState}
      coinReward={runCoins}
      onRetryCoins={() => void retryCoins()}
    />
  )
}
