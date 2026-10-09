// CH-01 — Challenges screen: every challenge with its title, description,
// targetValue, date range, derived status (Upcoming / Active / Finished) and
// progress computed from MY gameResults inside the challenge window (no
// separate challengeProgress collection — backlog DoD).
//
// Data: two Firestore reads (whole challenges list + my runs), both allowed
// by the CH-01 rules for signed-in players; guests get the sign-in guard,
// same pattern as Leaderboard/Profile (the spec's optional public read is a
// later decision). Progress degrades gracefully: if only the runs query
// fails, the list still renders with "—". Search + Active/Finished filter
// arrive with CH-02.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  computeProgress,
  deriveStatus,
  fetchChallenges,
  fetchMyGameResults,
  formatDateRange,
  targetLabel,
  type Challenge,
  type ChallengeProgress,
  type ChallengeStatus,
  type GameRun,
} from './challenges'

/** One rendered row: the challenge + its derived status and my progress. */
interface ChallengeRow {
  challenge: Challenge
  status: ChallengeStatus
  progress: ChallengeProgress
}

const STATUS_LABEL: Record<ChallengeStatus, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  finished: 'Finished',
}

export function ChallengesPage({
  signedInUid,
  onSignIn,
}: {
  signedInUid: string | null
  onSignIn: () => void
}) {
  const [rows, setRows] = useState<ChallengeRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The runs query can fail while the challenges list succeeded (rules,
  // network) — still show the list, just without progress numbers.
  const [runsFailed, setRunsFailed] = useState(false)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    setError(null)
    setRunsFailed(false)
    try {
      const challenges = await fetchChallenges()
      let runs: GameRun[] = []
      try {
        runs = await fetchMyGameResults(uid)
      } catch (err) {
        console.warn('CH-01: progress query failed', err)
        setRunsFailed(true)
      }
      const now = new Date()
      setRows(
        challenges.map((challenge) => ({
          challenge,
          status: deriveStatus(challenge, now),
          progress: computeProgress(challenge, runs),
        })),
      )
    } catch (err) {
      setRows(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // One fetch per uid (the ref keeps StrictMode's double mount to one call,
  // same guard LeaderboardPage uses).
  const lastUid = useRef<string | null>(null)
  useEffect(() => {
    if (!signedInUid || lastUid.current === signedInUid) return
    lastUid.current = signedInUid
    void load(signedInUid)
  }, [signedInUid, load])

  if (!signedInUid) {
    return (
      <div className="challenges-screen">
        <div className="guard">
          <p className="guard-text">
            Sign in with Telegram to see challenges and your progress.
          </p>
          <button type="button" className="btn" onClick={onSignIn}>
            Sign in with Telegram
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="challenges-screen">
      {loading ? (
        <p className="board-status">Loading…</p>
      ) : error ? (
        <div className="guard">
          <p className="guard-text">Could not load challenges.</p>
          <p className="placeholder-note">{error}</p>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              lastUid.current = null
              void load(signedInUid)
            }}
          >
            Retry
          </button>
        </div>
      ) : rows && rows.length > 0 ? (
        <>
          {runsFailed && (
            <p className="board-status" role="alert">
              Progress is unavailable right now — showing the challenges
              without it.
            </p>
          )}
          <ul className="challenge-list">
            {rows.map(({ challenge, status, progress }) => (
              <li key={challenge.id} className="challenge-card">
                <div className="challenge-head">
                  <h2 className="challenge-title">{challenge.title}</h2>
                  <span
                    className={`challenge-status challenge-status-${status}`}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <p className="challenge-desc">{challenge.description}</p>
                <p className="challenge-meta">
                  {targetLabel(challenge)} ·{' '}
                  {formatDateRange(challenge.startDate, challenge.endDate)}
                </p>
                {runsFailed ? (
                  <p className="challenge-progress">Progress: —</p>
                ) : (
                  <>
                    <div
                      className="challenge-bar"
                      role="progressbar"
                      aria-label={`${challenge.title} progress`}
                      aria-valuemin={0}
                      aria-valuemax={progress.target}
                      // Clamped: ARIA forbids valuenow > valuemax (finished
                      // runs can exceed the target — the text shows the raw
                      // value, the bar itself is capped at 100%).
                      aria-valuenow={Math.min(progress.value, progress.target)}
                    >
                      <span
                        className="challenge-bar-fill"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                    <p className="challenge-pct">
                      {progress.value} / {progress.target}
                      {progress.done ? ' ✓' : ''} · {progress.pct}%
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="board-status">
          No challenges yet — check back soon!
        </p>
      )}
    </div>
  )
}
