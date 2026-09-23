// UI-02 — Leaderboard screen placeholder (real data arrives with DATA-02/UI-03).
import { useState } from 'react'
import { PlaceholderPage } from './PlaceholderPage'

const PERIODS = ['Daily', 'Weekly', 'All Time'] as const

export function LeaderboardPage() {
  // Period switcher stub (DATA-02/UI-03 wire it to real queries).
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('Daily')

  return (
    <PlaceholderPage card="UI-03">
      <p className="placeholder-hint">Top 10 players by period.</p>
      <div className="period-toggle" role="tablist" aria-label="Leaderboard period">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            className={`btn btn-small${period === p ? ' btn-active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>
    </PlaceholderPage>
  )
}
