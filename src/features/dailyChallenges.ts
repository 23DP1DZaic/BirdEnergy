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
// CH-06 adds the screen: this module stays the data layer (callable + the
// owner-only profile read for the coin balance). Rewards are claimed through
// challengeRewards.ts, never by writing Firestore from here.
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
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

/**
 * The player's coin balance, read from their own users/{uid} document (the
 * rules allow the owner a single get). A missing/invalid field reads as 0 and
 * a failed read as null, so the Challenges screen can render without it —
 * claiming and purchases always re-read the balance server-side anyway.
 */
export async function fetchCoinBalance(uid: string): Promise<number | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return 0
    const coins = snap.data().coins
    return typeof coins === 'number' && Number.isFinite(coins) && coins >= 0
      ? coins
      : 0
  } catch (err) {
    console.warn('CH-06: coin balance read failed', err)
    return null
  }
}
