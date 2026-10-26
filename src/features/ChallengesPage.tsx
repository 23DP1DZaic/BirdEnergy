// CH-01 — Challenges screen: every admin challenge with its title, target,
// date range, derived status (Upcoming / Active / Finished) and progress
// computed from MY gameResults inside the challenge window (no separate
// challengeProgress collection — backlog DoD).
//
// CH-02 — search + filter over the admin list: title search and an
// All/Active/Finished switch over rows already in memory.
//
// CH-06 — two labelled sections. "Daily Challenges" shows the player's three
// personal assignments from getDailyChallenges: Easy/Easy/Hard badges, target,
// server-computed progress, coin reward, the countdown to the Europe/Riga
// reset, and the claim action. "Admin Challenges" keeps the list above.
//
// Trust rules that shape this screen:
//   * progress is only ever what the server (or the stored gameResults rows)
//     says — a finished run never changes a number optimistically here,
//   * claiming sends only {source, challengeId}; coins/claimed state come from
//     the response, and this screen never writes coins itself,
//   * the daily set is server-owned: refreshes (focus, midnight, a saved run)
//     re-read it and can never reroll today's assignments.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import {
  computeProgress,
  deriveStatus,
  fetchChallenges,
  fetchMyGameResults,
  filterChallengeRows,
  formatDateRange,
  type ChallengeFilter,
  type ChallengeRow,
  type ChallengeStatus,
  type GameRun,
} from './challenges'
import {
  fetchCoinBalance,
  fetchDailyChallenges,
  type DailyChallengeItem,
  type DailyChallenges,
} from './dailyChallenges'
import { claimChallengeReward } from './challengeRewards'
import { RUNS_SAVED_EVENT } from './pendingRuns'
import {
  DAILY_TITLE_KEY,
  DIFFICULTY_LABEL_KEY,
  challengeProgressPct,
  claimState,
  formatCountdown,
  orderDailyAssignments,
  remainingMs,
  type ClaimState,
} from './dailyChallengeUi'
import type { ChallengeType } from './challengeProgress'
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

/** Unit suffix for a challenge target ("20 points", "5 games", "40 jumps"). */
function targetUnitKey(type: ChallengeType): string {
  if (type === 'games_played') return 'target.games'
  if (type === 'total_jumps') return 'target.jumps'
  return 'target.points'
}

/** One readable line from a failed callable (its message already says why). */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return String(err)
}

export function ChallengesPage({
  signedInUid,
  onSignIn,
}: {
  signedInUid: string | null
  onSignIn: () => void
}) {
  const { t, tn } = useT()

  /* ---------------------------- daily state ---------------------------- */
  const [daily, setDaily] = useState<DailyChallenges | null>(null)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyError, setDailyError] = useState<string | null>(null)
  const [coins, setCoins] = useState<number | null>(null)
  /** Ticks once a second so the reset countdown and Expired state stay live. */
  const [now, setNow] = useState(() => Date.now())
  const [claimingIds, setClaimingIds] = useState<string[]>([])
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({})
  /** Synchronous duplicate guard: a double click cannot start two claims. */
  const claimInFlight = useRef(new Set<string>())
  /** The current expiry, for the focus/visibility refresh (no re-subscribes). */
  const dailyExpiryRef = useRef<number | null>(null)
  /** The expiry a rollover refresh was already started for. */
  const rolledFor = useRef<number | null>(null)

  /* ---------------------------- admin state ---------------------------- */
  const [rows, setRows] = useState<ChallengeRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The runs query can fail while the challenges list succeeded (rules,
  // network) — still show the list, just without progress numbers.
  const [runsFailed, setRunsFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ChallengeFilter>('all')

  const visibleRows = useMemo(
    () => filterChallengeRows(rows ?? [], query, filter),
    [rows, query, filter],
  )
  const filtering = query.trim() !== '' || filter !== 'all'

  /* ---------------------------- data loading --------------------------- */

  const loadDaily = useCallback(async () => {
    setDailyLoading(true)
    setDailyError(null)
    try {
      const data = await fetchDailyChallenges()
      dailyExpiryRef.current = Date.parse(data.expiresAt)
      setDaily(data)
      // A reload always describes one day: errors from another day's attempt
      // must not stick to a fresh set.
      setClaimErrors({})
    } catch (err) {
      console.warn('CH-06: daily challenges failed', err)
      setDailyError(describeError(err))
    } finally {
      setDailyLoading(false)
    }
  }, [])

  const loadAdmin = useCallback(async (uid: string) => {
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
      const nowDate = new Date()
      setRows(
        challenges.map((challenge) => ({
          challenge,
          status: deriveStatus(challenge, nowDate),
          progress: computeProgress(challenge, runs),
        })),
      )
    } catch (err) {
      setRows(null)
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCoins = useCallback(async (uid: string) => {
    setCoins(await fetchCoinBalance(uid))
  }, [])

  // One fetch per uid (the ref keeps StrictMode's double mount to one call).
  const lastUid = useRef<string | null>(null)
  useEffect(() => {
    if (!signedInUid || lastUid.current === signedInUid) return
    lastUid.current = signedInUid
    void loadDaily()
    void loadAdmin(signedInUid)
    void loadCoins(signedInUid)
  }, [signedInUid, loadDaily, loadAdmin, loadCoins])

  // The countdown and the Expired state are time-driven, not event-driven.
  useEffect(() => {
    if (!signedInUid) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [signedInUid])

  // Midnight in Europe/Riga: the stored set has expired, so ask the server for
  // the NEXT day (it lazily creates it). Guarded per expiry so a slow network
  // does not fire the same refresh every second.
  const expiryMs = daily ? Date.parse(daily.expiresAt) : Number.NaN
  useEffect(() => {
    if (!signedInUid || !Number.isFinite(expiryMs)) return
    if (now < expiryMs || rolledFor.current === expiryMs) return
    rolledFor.current = expiryMs
    void loadDaily()
  }, [now, expiryMs, signedInUid, loadDaily])

  // Returning to the app (tab switch, phone unlock, back/forward cache) after
  // the reset must pick up the new day without a manual reload.
  useEffect(() => {
    if (!signedInUid) return
    const refreshIfDue = () => {
      const expires = dailyExpiryRef.current
      if (expires === null || Date.now() >= expires) {
        void loadDaily()
        void loadAdmin(signedInUid)
        void loadCoins(signedInUid)
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshIfDue()
    }
    window.addEventListener('focus', refreshIfDue)
    window.addEventListener('pageshow', refreshIfDue)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refreshIfDue)
      window.removeEventListener('pageshow', refreshIfDue)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [signedInUid, loadDaily, loadAdmin, loadCoins])

  // A run confirmed by the server changes progress — re-read it (both sources)
  // instead of adding the score here.
  useEffect(() => {
    if (!signedInUid) return
    const onRunsSaved = () => {
      void loadDaily()
      void loadAdmin(signedInUid)
    }
    window.addEventListener(RUNS_SAVED_EVENT, onRunsSaved)
    return () => window.removeEventListener(RUNS_SAVED_EVENT, onRunsSaved)
  }, [signedInUid, loadDaily, loadAdmin])

  /* ------------------------------ claiming ----------------------------- */

  const claim = useCallback(
    async (item: DailyChallengeItem) => {
      if (claimInFlight.current.has(item.id)) return
      claimInFlight.current.add(item.id)
      setClaimingIds((ids) => [...ids, item.id])
      setClaimErrors((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
      try {
        const result = await claimChallengeReward('daily', item.id)
        // Coins come from the server response only — nothing is granted here.
        setCoins(result.coins)
        const claimedAt = new Date().toISOString()
        setDaily((current) =>
          current
            ? {
                ...current,
                assignments: current.assignments.map((assignment) =>
                  assignment.id === item.id
                    ? { ...assignment, claimedAt }
                    : assignment,
                ),
              }
            : current,
        )
      } catch (err) {
        // Retryable: the button stays available and the server's reason shows.
        setClaimErrors((current) => ({
          ...current,
          [item.id]: describeError(err),
        }))
        console.warn('CH-06: claim failed', item.id, err)
      } finally {
        claimInFlight.current.delete(item.id)
        setClaimingIds((ids) => ids.filter((id) => id !== item.id))
      }
    },
    [],
  )

  /* ------------------------------- render ------------------------------ */

  if (!signedInUid) {
    return (
      <div className="challenges-screen">
        <div className="guard">
          <p className="guard-text">{t('challenges.guard')}</p>
          <button type="button" className="btn" onClick={onSignIn}>
            {t('sign.signIn')}
          </button>
        </div>
      </div>
    )
  }

  const dailyItems = daily ? orderDailyAssignments(daily.assignments) : []
  const resetIn = daily ? formatCountdown(remainingMs(daily.expiresAt, now)) : ''

  const renderClaimAction = (item: DailyChallengeItem): ReactElement => {
    const state: ClaimState = claimState(item, daily?.expiresAt ?? 0, now)
    const busy = claimingIds.includes(item.id)
    if (state === 'claimed') {
      return (
        <span className="claim-state claim-state-claimed">
          {t('daily.claimed')}
        </span>
      )
    }
    if (state === 'expired') {
      return (
        <span className="claim-state claim-state-expired">
          {t('daily.expired')}
        </span>
      )
    }
    const ready = state === 'ready'
    return (
      <button
        type="button"
        className={`btn btn-small claim-button${ready ? ' claim-button-ready' : ''}`}
        disabled={!ready || busy}
        aria-disabled={!ready || busy}
        onClick={() => void claim(item)}
      >
        {busy ? t('daily.claiming') : t('daily.claim', { n: item.rewardCoins })}
      </button>
    )
  }

  return (
    <div className="challenges-screen">
      {/* ------------------------- daily section ------------------------- */}
      <section className="challenge-section" aria-labelledby="daily-heading">
        <div className="challenge-section-head">
          <h2 className="challenge-section-title" id="daily-heading">
            {t('daily.title')}
          </h2>
          {coins !== null && (
            <span className="challenge-balance">
              {t('profile.coins', { n: coins })}
            </span>
          )}
        </div>

        {daily && (
          <p className="daily-reset">
            {t('daily.reset', { time: resetIn })}
          </p>
        )}

        {dailyLoading && !daily ? (
          <p className="board-status">{t('common.loading')}</p>
        ) : dailyError && !daily ? (
          <div className="challenge-section-error" role="alert">
            <p className="board-status">{t('daily.loadError')}</p>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => void loadDaily()}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : dailyItems.length === 0 ? (
          <p className="board-status">{t('daily.empty')}</p>
        ) : (
          <ul className="challenge-list">
            {dailyItems.map((item) => {
              const pct = challengeProgressPct(item.progress, item.targetValue)
              const title = t(DAILY_TITLE_KEY[item.type], {
                n: item.targetValue,
              })
              return (
                <li key={item.id} className="challenge-card challenge-card-daily">
                  <div className="challenge-head">
                    <h3 className="challenge-title">{title}</h3>
                    <span
                      className={`challenge-difficulty challenge-difficulty-${item.difficulty}`}
                    >
                      {t(DIFFICULTY_LABEL_KEY[item.difficulty])}
                    </span>
                  </div>
                  <p className="challenge-meta">
                    {t('target.label', {
                      n: item.targetValue,
                      unit: t(targetUnitKey(item.type)),
                    })}
                    <span className="daily-reward">
                      {t('daily.reward', { n: item.rewardCoins })}
                    </span>
                  </p>
                  <div
                    className="challenge-bar"
                    role="progressbar"
                    aria-label={t('challenges.progressAria', { title })}
                    aria-valuemin={0}
                    aria-valuemax={item.targetValue}
                    aria-valuenow={Math.min(
                      item.progress,
                      item.targetValue,
                    )}
                  >
                    <span
                      className="challenge-bar-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="challenge-pct">
                    {t('daily.progress', {
                      value: item.progress,
                      target: item.targetValue,
                    })}
                  </p>
                  <div className="claim-row">{renderClaimAction(item)}</div>
                  {claimErrors[item.id] && (
                    <p className="challenge-error" role="alert">
                      {t('daily.claimError', {
                        message: claimErrors[item.id],
                      })}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ------------------------- admin section ------------------------- */}
      <section className="challenge-section" aria-labelledby="admin-heading">
        <div className="challenge-section-head">
          <h2 className="challenge-section-title" id="admin-heading">
            {t('daily.adminTitle')}
          </h2>
        </div>

        {loading && !rows ? (
          <p className="board-status">{t('common.loading')}</p>
        ) : error ? (
          <div className="challenge-section-error" role="alert">
            <p className="board-status">{t('challenges.error')}</p>
            <p className="placeholder-note">{error}</p>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => void loadAdmin(signedInUid)}
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
                <p className="board-status">{t('challenges.noMatch')}</p>
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
                      <h3 className="challenge-title">{challenge.title}</h3>
                      <span
                        className={`challenge-status challenge-status-${status}`}
                      >
                        {t(STATUS_KEY[status])}
                      </span>
                    </div>
                    <p className="challenge-desc">{challenge.description}</p>
                    <p className="challenge-meta">
                      {t('target.label', {
                        n: challenge.targetValue,
                        unit: t(targetUnitKey(challenge.type)),
                      })}{' '}
                      · {formatDateRange(challenge.startDate, challenge.endDate)}
                      {typeof challenge.rewardCoins === 'number' && (
                        <span className="daily-reward">
                          {t('daily.reward', { n: challenge.rewardCoins })}
                        </span>
                      )}
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
                          aria-valuenow={Math.min(
                            progress.value,
                            progress.target,
                          )}
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
          <p className="board-status">{t('challenges.none')}</p>
        )}
      </section>
    </div>
  )
}
