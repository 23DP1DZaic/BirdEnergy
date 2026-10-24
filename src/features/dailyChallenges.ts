// CH-05 — the client half of the daily challenge feature: one typed wrapper
// around the getDailyChallenges callable.
//
// The server owns the whole decision (Riga calendar day, the 3 assignments,
// their targets/rewards). The client sends NOTHING — no date, no timezone, no
// ids — and only receives today's stored set plus the progress computed from
// this player's accepted runs. Repeated calls (refresh, multiple tabs,
// signing out and back in) return the same assignments until the next Riga
// midnight, so this is safe to call on every mount.
//
// Rewards are not claimed here (CH-06/CH-07 add claiming and purchases); this
// module ships the data contract only, no screens.
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import type { ChallengeDifficulty, EconomyChallengeType } from './economy'

/** One of the day's three assignments, with this player's progress on it. */
export interface DailyChallengeItem {
  /** Stable id — also the challengeClaims/{id} document id once claimed. */
  id: string
  type: EconomyChallengeType
  /** Stored value; 'normal' is displayed as "Easy" by the UI layer. */
  difficulty: ChallengeDifficulty
  targetValue: number
  rewardCoins: number
  /** Snapshot title generated with the assignment (localizable by type). */
  title: string
  /** ISO 8601 of the claim, or null while unclaimed. */
  claimedAt: string | null
  /** Progress clamped to targetValue ("40/40", never "97/40"). */
  progress: number
  completed: boolean
}

/** Today's daily challenge set. */
export interface DailyChallenges {
  /** 'YYYY-MM-DD' — the current Europe/Riga calendar day. */
  dateKey: string
  /** IANA zone the day was computed in ('Europe/Riga'). */
  timezone: string
  /** ISO 8601 window start — accepted runs from here count. */
  startsAt: string
  /** ISO 8601 window end (next Riga midnight) — the UI's countdown target. */
  expiresAt: string
  assignments: DailyChallengeItem[]
}

/** Today's assignments (creating them on the server's first call of the day). */
export async function fetchDailyChallenges(): Promise<DailyChallenges> {
  const call = httpsCallable<undefined, DailyChallenges>(
    functions,
    'getDailyChallenges',
  )
  const response = await call()
  return response.data
}
