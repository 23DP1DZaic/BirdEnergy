// CH-01 — Challenges data + pure progress logic (client side).
//
// Two Firestore reads feed this screen, both allowed by the CH-01 rules for
// signed-in players:
//   * challenges/ — the whole list (sorted startDate desc, per spec);
//   * gameResults/ — MY runs only (query must filter where uid == auth.uid,
//     which is exactly what fetchMyGameResults does — the rules reject any
//     unscoped query).
//
// Progress is computed from gameResults with NO separate challengeProgress
// collection (backlog DoD):
//   * single_game_score → best score among my runs inside [startDate, endDate]
//   * games_played      → count of my runs inside [startDate, endDate]
//
// `active` is never stored — the spec derives it as
// startDate <= now <= endDate (see deriveStatus).
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '../firebase'

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

export type ChallengeStatus = 'upcoming' | 'active' | 'finished'

export interface ChallengeProgress {
  /** Best score / games played inside the challenge window. */
  value: number
  target: number
  /** Percent of target, capped at 100 (the bar never overshoots). */
  pct: number
  /** Goal reached: value >= target. */
  done: boolean
}

/**
 * Date from a Firestore Timestamp (duck-typed toDate()), a Date, or an ISO
 * string/epoch number. Returns null for missing/corrupt values.
 */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const d = (value as { toDate: () => unknown }).toDate()
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d
    return null
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Defensive parse: admin CRUD (ADM-01) does not exist yet, so docs may be
 * seeded/edited by hand — anything malformed is skipped instead of crashing
 * the screen.
 */
function parseChallenge(id: string, data: DocumentData): Challenge | null {
  const title = typeof data.title === 'string' ? data.title.trim() : ''
  const description =
    typeof data.description === 'string' ? data.description.trim() : ''
  const type = data.type
  const targetValue = data.targetValue
  const startDate = toDate(data.startDate)
  const endDate = toDate(data.endDate)
  if (!title || !description) return null
  if (type !== 'single_game_score' && type !== 'games_played') return null
  if (
    typeof targetValue !== 'number' ||
    !Number.isFinite(targetValue) ||
    targetValue <= 0
  ) {
    return null
  }
  if (!startDate || !endDate || endDate.getTime() < startDate.getTime()) {
    return null
  }
  return { id, title, description, type, targetValue, startDate, endDate }
}

/**
 * All challenges, newest start first (spec: "kārtot pēc startDate desc").
 * Search + Active/Finished filtering happen client-side later (CH-02).
 */
export async function fetchChallenges(): Promise<Challenge[]> {
  const snap = await getDocs(
    query(collection(db, 'challenges'), orderBy('startDate', 'desc')),
  )
  const challenges: Challenge[] = []
  for (const doc of snap.docs) {
    const parsed = parseChallenge(doc.id, doc.data())
    if (parsed) challenges.push(parsed)
    else console.warn('CH-01: skipping invalid challenge doc', doc.id)
  }
  return challenges
}

/**
 * My finished runs, newest first. No orderBy in the Firestore query — that
 * would need a composite index (uid + createdAt); sorting client-side keeps
 * it index-free, same trade-off getLeaderboard makes server-side.
 */
export async function fetchMyGameResults(uid: string): Promise<GameRun[]> {
  const snap = await getDocs(
    query(collection(db, 'gameResults'), where('uid', '==', uid)),
  )
  const runs: GameRun[] = []
  for (const doc of snap.docs) {
    const data = doc.data()
    const createdAt = toDate(data.createdAt)
    if (typeof data.score !== 'number' || !createdAt) continue
    runs.push({ score: data.score, createdAt })
  }
  runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return runs
}

/** Derived status — spec: never store `active`, compute it from the dates. */
export function deriveStatus(challenge: Challenge, now: Date): ChallengeStatus {
  if (now.getTime() < challenge.startDate.getTime()) return 'upcoming'
  if (now.getTime() > challenge.endDate.getTime()) return 'finished'
  return 'active'
}

/** Progress from my runs inside [startDate, endDate] (CH-01 DoD). */
export function computeProgress(
  challenge: Challenge,
  runs: GameRun[],
): ChallengeProgress {
  const start = challenge.startDate.getTime()
  const end = challenge.endDate.getTime()
  let value = 0
  for (const run of runs) {
    const t = run.createdAt.getTime()
    if (t < start || t > end) continue
    if (challenge.type === 'games_played') value += 1
    else if (run.score > value) value = run.score
  }
  const target = challenge.targetValue
  const pct = Math.min(100, Math.round((value / target) * 100))
  return { value, target, pct, done: value >= target }
}

/** Compact date range: "3–10 Aug 2026", "28 Sep – 4 Oct 2026". */
export function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    })
  const sameYear = start.getFullYear() === end.getFullYear()
  if (sameYear && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${fmt(end, true)}`
  }
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`
}

/** Target line: "Target: 100 points" / "Target: 10 games". */
export function targetLabel(challenge: Challenge): string {
  const unit = challenge.type === 'games_played' ? 'games' : 'points'
  return `Target: ${challenge.targetValue} ${unit}`
}
