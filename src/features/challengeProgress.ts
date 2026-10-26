// CH-01 — pure challenge progress logic. No Firebase/React imports: this
// module is unit-tested from Node the same way the game engine is (see
// challengeProgress.test.ts) — challenges.ts owns everything that touches
// Firestore and re-exports this layer unchanged for its callers.
//
// Progress is computed from gameResults with NO separate challengeProgress
// collection (backlog DoD):
//   * single_game_score -> best score among my runs inside [startDate, endDate]
//   * games_played      -> count of my runs inside [startDate, endDate]
//
// CH-04 — the admin CRUD now writes all four ECON-01 types, so the two sums
// join the two originals:
//   * total_score       -> sum of score over my runs inside the window
//   * total_jumps       -> sum of jumpCount over my runs inside the window
//
// The displayed VALUE is capped at the target: a finished challenge reads
// "2/2" or "100/100" — going past the goal changes nothing the player can
// see (4/2 or 101/100 reads as a bug; the percentage bar was always capped,
// now the number matches it).

import type {
  ChallengeDifficulty,
  EconomyChallengeType,
} from './economy.ts'

/** The admin CRUD offers the full ECON-01 superset (CH-04); legacy two-type
 *  documents remain valid members of this union. */
export type ChallengeType = EconomyChallengeType

export interface Challenge {
  id: string
  title: string
  description: string
  type: ChallengeType
  targetValue: number
  startDate: Date
  endDate: Date
  /** ECON-01 tier configuration (CH-04). ABSENT on legacy documents — a
   *  challenge saved before the economy configuration existed is viewable
   *  but non-rewarding until an admin explicitly edits it into a valid
   *  type/difficulty/target triple. */
  difficulty?: ChallengeDifficulty
  /** Server-derived coins for the stored tier triple; absent like difficulty. */
  rewardCoins?: number
}

/** One of my finished runs — everything progress needs. */
export interface GameRun {
  score: number
  createdAt: Date
  /** DATA-01 field; absent on runs stored before jumpCount existed. */
  jumpCount?: number
}

export interface ChallengeProgress {
  /** Best score / games played inside the window, capped at the target. */
  value: number
  target: number
  /** Percent of target, capped at 100 (the bar never overshoots). */
  pct: number
  /** Goal reached: the RAW measure reached the target. */
  done: boolean
}

/** Progress from my runs inside [startDate, endDate] (CH-01 DoD). */
export function computeProgress(
  challenge: Challenge,
  runs: GameRun[],
): ChallengeProgress {
  const start = challenge.startDate.getTime()
  const end = challenge.endDate.getTime()
  let raw = 0
  for (const run of runs) {
    const t = run.createdAt.getTime()
    if (t < start || t > end) continue
    switch (challenge.type) {
      case 'games_played':
        raw += 1
        break
      case 'total_score':
        raw += run.score
        break
      case 'total_jumps':
        raw += run.jumpCount ?? 0
        break
      default:
        // single_game_score — the best single run, not a sum.
        if (run.score > raw) raw = run.score
    }
  }
  const target = challenge.targetValue
  // A finished challenge is DONE, not "better than done": both the number
  // and the bar stop at the target.
  const value = Math.min(raw, target)
  const pct = Math.min(100, Math.round((raw / target) * 100))
  return { value, target, pct, done: raw >= target }
}
