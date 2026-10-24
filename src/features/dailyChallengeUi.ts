// CH-06 — pure presentation logic for the Daily Challenges section.
//
// No Firebase/React imports: the countdown, the progress clamp and the claim
// state machine run in Node (dailyChallengeUi.test.ts) exactly as the screen
// uses them. The authoritative numbers still come from the server
// (getDailyChallenges / claimChallengeReward); nothing here can complete,
// expire or claim a challenge — it only decides what the row looks like.
//
// The states, in precedence order:
//   claimed     — the stored snapshot has a claimedAt (stays claimed even
//                 after expiry — the reward was already paid)
//   expired     — now >= the server-returned expiresAt (the next Europe/Riga
//                 day has started; the claim callable would reject it)
//   ready       — completed (server-computed from accepted results) and still
//                 inside the window: the only case with an enabled Claim button
//   incomplete  — not enough accepted progress yet
export type ClaimState = 'claimed' | 'expired' | 'ready' | 'incomplete'

/** Everything the claim state machine needs from one assignment. */
export interface ClaimStateInput {
  claimedAt: string | null
  completed: boolean
}

/** i18n keys for the two stored difficulty values ("normal" shows as Easy). */
export const DIFFICULTY_LABEL_KEY = {
  normal: 'difficulty.easy',
  hard: 'difficulty.hard',
} as const

export type ChallengeDifficultyValue = keyof typeof DIFFICULTY_LABEL_KEY

/** i18n keys for a daily title, built from the snapshot's type + target. */
export const DAILY_TITLE_KEY = {
  total_jumps: 'daily.goal.jumps',
  games_played: 'daily.goal.games',
  single_game_score: 'daily.goal.singleScore',
  total_score: 'daily.goal.totalScore',
} as const

export type DailyChallengeTypeValue = keyof typeof DAILY_TITLE_KEY

/** Progress bar width: 0–100, integer, never NaN/negative/overshooting. */
export function challengeProgressPct(
  progress: unknown,
  targetValue: unknown,
): number {
  if (
    typeof progress !== 'number' ||
    typeof targetValue !== 'number' ||
    !Number.isFinite(progress) ||
    !Number.isFinite(targetValue) ||
    targetValue <= 0
  ) {
    return 0
  }
  const pct = Math.round((progress / targetValue) * 100)
  return Math.min(100, Math.max(0, pct))
}

/** Milliseconds left until an ISO timestamp (clamped at 0, invalid → 0). */
export function remainingMs(
  expiresAt: string | number | Date,
  nowMs: number,
): number {
  const end =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt === 'number'
        ? expiresAt
        : Date.parse(expiresAt)
  if (!Number.isFinite(end) || !Number.isFinite(nowMs)) return 0
  return Math.max(0, end - nowMs)
}

/**
 * Countdown text until the Europe/Riga reset: "04:09:31" (hours never wrap at
 * 24 — the autumn DST day is 25 hours long). Expired reads "00:00:00".
 */
export function formatCountdown(ms: number): string {
  const totalSeconds =
    Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** Which of the four row states the assignment is in right now. */
export function claimState(
  item: ClaimStateInput,
  expiresAt: string | number | Date,
  nowMs: number,
): ClaimState {
  if (item.claimedAt !== null) return 'claimed'
  if (remainingMs(expiresAt, nowMs) === 0) return 'expired'
  return item.completed ? 'ready' : 'incomplete'
}

/**
 * Display order: the two Easy rows first, then the Hard one (stable for equal
 * difficulty), so the section always reads Easy, Easy, Hard.
 */
export function orderDailyAssignments<T extends { difficulty: unknown }>(
  items: readonly T[],
): T[] {
  const rank = (difficulty: unknown) =>
    difficulty === 'hard' ? 1 : difficulty === 'normal' ? 0 : 2
  return [...items].sort((a, b) => rank(a.difficulty) - rank(b.difficulty))
}
