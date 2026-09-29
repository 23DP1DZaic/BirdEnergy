// UI-03 — Leaderboard screen: top 10 with place, name, score and a
// Daily/Weekly/All Time switcher (the list refetches on every period change).
//
// Data comes from the getLeaderboard callable (DATA-02) — Firestore rules keep
// users/ and gameResults/ private, so the client cannot query them directly.
// Guests see a sign-in prompt instead of the board (entries are name+score
// only, but the screen is part of the signed-in experience like Profile).
import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import {
  fetchLeaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from './leaderboard'
import type { UserProfile } from './userProfile'

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'all', label: 'All Time' },
]

/** 1st/2nd/3rd get a medal, everyone else a plain number. */
function placeLabel(place: number): string {
  if (place === 1) return '🥇'
  if (place === 2) return '🥈'
  if (place === 3) return '🥉'
  return String(place)
}

export function LeaderboardPage({
  signedInUid,
  onSignIn,
}: {
  signedInUid: string | null
  onSignIn: () => void
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('daily')
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // My row for context under the board (All Time: the users/ aggregate;
  // Daily/Weekly: my best run inside the window, resolved client-side).
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null)

  const load = useCallback(async (p: LeaderboardPeriod) => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchLeaderboard(p)
      setEntries(rows)

      // The signed-in player's context row (may be outside the top 10).
      let mine: LeaderboardEntry | null = null
      try {
        const snap = await getDoc(doc(db, 'users', signedInUid as string))
        const profile = snap.data() as UserProfile | undefined
        const myName = profile
          ? (profile.username ?? profile.firstName ?? 'Player')
          : 'Player'
        if (p === 'all') {
          mine = { name: myName, score: profile?.bestScore ?? 0 }
        } else {
          const inBoard = rows.find((r) => r.name === myName)
          mine = inBoard ?? null
        }
      } catch {
        mine = null // profile read failed — the context row is optional
      }
      setMyEntry(mine)
    } catch (err) {
      setEntries(null)
      setMyEntry(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [signedInUid])

  // Refetch whenever the period changes — DoD: "Saraksts korekti atjaunojas,
  // mainot periodu". Guarded so StrictMode's double invoke stays one request.
  const lastRequested = useRef<LeaderboardPeriod | null>(null)
  useEffect(() => {
    if (lastRequested.current === period) return
    lastRequested.current = period
    void load(period)
  }, [period, load])

  return (
    <div className="board-screen">
      <div
        className="period-toggle"
        role="tablist"
        aria-label="Leaderboard period"
      >
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={period === p.id}
            className={`btn btn-small${period === p.id ? ' btn-active' : ''}`}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!signedInUid ? (
        <div className="guard">
          <p className="guard-text">
            Sign in with Telegram to see the leaderboard and record your runs.
          </p>
          <button type="button" className="btn" onClick={onSignIn}>
            Sign in with Telegram
          </button>
        </div>
      ) : loading ? (
        <p className="board-status">Loading…</p>
      ) : error ? (
        <div className="guard">
          <p className="guard-text">Could not load the leaderboard.</p>
          <p className="placeholder-note">{error}</p>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              lastRequested.current = null
              void load(period)
            }}
          >
            Retry
          </button>
        </div>
      ) : entries && entries.length > 0 ? (
        <ol className="board">
          {entries.map((entry, i) => (
            <li key={`${entry.name}-${i}`} className="lrow">
              <span className="lrow-place">{placeLabel(i + 1)}</span>
              <span className="lrow-name">{entry.name}</span>
              <span className="lrow-score">{entry.score}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="board-status">
          No scores yet for this period — go set one!
        </p>
      )}

      {signedInUid && myEntry && !loading && !error && (
        <p className="board-mine">
          Your best: {myEntry.name} — {myEntry.score}
        </p>
      )}
    </div>
  )
}
