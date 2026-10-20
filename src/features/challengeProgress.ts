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
// The displayed VALUE is capped at the target: a finished challenge reads
// "2/2" or "100/100" — going past the goal changes nothing the player can
// see (4/2 or 101/100 reads as a bug; the percentage bar was always capped,
// now the number matches it).

export type ChallengeType = 'single_game_score' | 'games_played'

export interface Challenge {
  id: string
  title: string
  description: string
  type: ChallengeType
  targetValue: number
  startDate: Date
  endDate: Date
}

/** One of my finished runs — everything progress needs. */
export interface GameRun {
  score: number
  createdAt: Date
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
    if (challenge.type === 'games_played') raw += 1
    else if (run.score > raw) raw = run.score
  }
  const target = challenge.targetValue
  // A finished challenge is DONE, not "better than done": both the number
  // and the bar stop at the target.
  const value = Math.min(raw, target)
  const pct = Math.min(100, Math.round((raw / target) * 100))
  return { value, target, pct, done: raw >= target }
}
