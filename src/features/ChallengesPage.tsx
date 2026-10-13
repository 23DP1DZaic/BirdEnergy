// CH-01 — Challenges screen: every challenge with its title, description,
// targetValue, date range, derived status (Upcoming / Active / Finished) and
// progress computed from MY gameResults inside the challenge window (no
// separate challengeProgress collection — backlog DoD).
//
// CH-02 — search + filter: a title search box and an All/Active/Finished tab
// switch over the rows already in memory. Both run through
// filterChallengeRows (pure, in challenges.ts) on every keystroke: the list
// reacts in real time without a single extra Firestore read.
//
// Data: two Firestore reads (whole challenges list + my runs), both allowed
// by the CH-01 rules for signed-in players; guests get the sign-in guard,
// same pattern as Leaderboard/Profile (the spec's optional public read is a
// later decision). Progress degrades gracefully: if only the runs query
// fails, the list still renders with "—".
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  computeProgress,
  deriveStatus,
  fetchChallenges,
  fetchMyGameResults,
  filterChallengeRows,
  formatDateRange,
  targetLabel,
  type ChallengeFilter,
  type ChallengeRow,
  type ChallengeStatus,
  type GameRun,
} from './challenges'
import { useT } from '../i18n'

/** Status label key per status — translated in the component via t(). */
const STATUS_KEY: Record<ChallengeStatus, string> = {
  upcoming: 'status.upcoming',
  active: 'status.active',
  finished: 'status.finished',
}

/** CH-02 filter tabs in display order ('all' first, the default). */
const FILTERS: { id: ChallengeFilter; labelKey: string }[] = [
  { id: 'all', labelKey: 'filter.all' },
  { id: 'active', labelKey: 'filter.active' },
  { id: 'finished', labelKey: 'filter.finished' },
]

export function ChallengesPage({
  signedInUid,
  onSignIn,
}: {
  signedInUid: string | null
  onSignIn: () => void
}) {
  const { t, tn } = useT()
  const [rows, setRows] = useState<ChallengeRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The runs query can fail while the challenges list succeeded (rules,
  // network) — still show the list, just without progress numbers.
  const [runsFailed, setRunsFailed] = useState(false)
  // CH-02: the search box text and the active tab. Both are local state only
  // — filtering happens over `rows`, never over the network.
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ChallengeFilter>('all')

  /** Rows passing BOTH the title search and the status tab, in list order. */
  const visibleRows = useMemo(
    () => filterChallengeRows(rows ?? [], query, filter),
    [rows, query, filter],
  )
  /** True when the filters are hiding rows that exist (vs. an empty list). */
  const filtering = query.trim() !== '' || filter !== 'all'

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
            {t('challenges.guard')}
          </p>
          <button type="button" className="btn" onClick={onSignIn}>
            {t('sign.signIn')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="challenges-screen">
      {loading ? (
        <p className="board-status">{t('common.loading')}</p>
      ) : error ? (
        <div className="guard">
          <p className="guard-text">{t('challenges.error')}</p>
          <p className="placeholder-note">{error}</p>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              lastUid.current = null
              void load(signedInUid)
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : rows && rows.length > 0 ? (
        <>
          {runsFailed && (
            <p className="board-status" role="alert">
              {t('challenges.progressUnavailable')}
            </p>
          )}
          {/* CH-02 toolbar: live title search + All/Active/Finished tabs. */}
          <div className="challenge-toolbar">
            <div className="challenge-search-row">
              <input
                type="text"
                className="challenge-search"
                placeholder={t('challenges.search')}
                aria-label={t('challenges.searchAria')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query !== '' && (
                <button
                  type="button"
                  className="btn btn-small"
                  aria-label={t('challenges.clearSearch')}
                  onClick={() => setQuery('')}
                >
                  ✕
                </button>
              )}
            </div>
            <div
              className="period-toggle"
              role="tablist"
              aria-label={t('challenges.filterAria')}
            >
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  className={`btn btn-small${filter === f.id ? ' btn-active' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {t(f.labelKey)}
                </button>
              ))}
            </div>
            {/* Live region: the count updates as you type. */}
            <p className="challenge-count" role="status">
              {filtering
                ? t('challenges.shown', {
                    shown: visibleRows.length,
                    total: rows.length,
                  })
                : tn('challenges.count', rows.length)}
            </p>
          </div>
          {visibleRows.length === 0 ? (
            <div className="challenge-none">
              <p className="board-status">
                {t('challenges.noMatch')}
              </p>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setQuery('')
                  setFilter('all')
                }}
              >
                {t('challenges.clearFilters')}
              </button>
            </div>
          ) : (
            <ul className="challenge-list">
              {visibleRows.map(({ challenge, status, progress }) => (
                <li key={challenge.id} className="challenge-card">
                  <div className="challenge-head">
                    <h2 className="challenge-title">{challenge.title}</h2>
                    <span
                      className={`challenge-status challenge-status-${status}`}
                    >
                      {t(STATUS_KEY[status])}
                    </span>
                  </div>
                  <p className="challenge-desc">{challenge.description}</p>
                  <p className="challenge-meta">
                    {targetLabel(challenge)} ·{' '}
                    {formatDateRange(challenge.startDate, challenge.endDate)}
                  </p>
                  {runsFailed ? (
                    <p className="challenge-progress">
                      {t('challenges.progressMissing')}
                    </p>
                  ) : (
                    <>
                      <div
                        className="challenge-bar"
                        role="progressbar"
                        aria-label={t('challenges.progressAria', {
                          title: challenge.title,
                        })}
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
          )}
        </>
      ) : (
        <p className="board-status">
          {t('challenges.none')}
        </p>
      )}
    </div>
  )
}
