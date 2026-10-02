// UI-03/DATA-02 — leaderboard data (client side).
//
// Firestore rules (SEC-01) keep users/ and gameResults/ private, so ranking
// queries go through the getLeaderboard callable (Admin SDK server-side).
// The response carries display data only: leaderboard name + score, no ids.
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

export type LeaderboardPeriod = 'daily' | 'weekly' | 'all'

export interface LeaderboardEntry {
  /** Display name: in-game name → @username → first name → "Player". */
  name: string
  score: number
  /** Telegram profile photo; null when the player has none (UI falls back
   *  to the bird sprite — no custom avatars exist). */
  photoUrl: string | null
}

/**
 * Top 10 rows for the chosen period. All three periods are resolved by the
 * same callable (daily/weekly rank best runs from gameResults, all ranks the
 * users/ bestScore aggregates).
 */
export async function fetchLeaderboard(
  period: LeaderboardPeriod,
): Promise<LeaderboardEntry[]> {
  const get = httpsCallable<
    { period: LeaderboardPeriod },
    { entries: LeaderboardEntry[] }
  >(functions, 'getLeaderboard')
  const result = await get({ period })
  return result.data.entries
}
