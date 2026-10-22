// ECON-01 — client half of the economy contract.
//
// The server (functions/src/economy.ts) is the trust boundary: it owns the
// reward table, the prices and the profile initialization. This module mirrors
// only what the UI must know to RENDER state:
//
//   * the four challenge types and the two difficulty values (a daily
//     assignment snapshot carries its own targetValue/rewardCoins, so the
//     client never needs the reward table);
//   * the cosmetic catalog in the SAME order as the sprite manifests —
//     SKIN_IDS ↔ birdSkinUrls (src/features/game/sprites.ts),
//     BACKGROUND_IDS ↔ backgrounds (src/sprites.ts);
//   * the explicit free lists and the coin prices;
//   * the read-side shapes of the documents ECON-02/ECON-03 will consume.
//
// IDs, not array positions, are the persistent identity: free ownership is
// decided by FREE_SKIN_IDS / FREE_BACKGROUND_IDS, so adding or reordering an
// asset can never change what a player owns for free.
//
// Note on names: `ChallengeType` here is the daily-challenge vocabulary. The
// legacy `challenges/` collection (admin CRUD) keeps the narrower two-value
// type in challenges.ts; those documents have no difficulty/reward and are
// intentionally left unchanged.

/** Must mirror ECONOMY_VERSION in functions/src/economy.ts. */
export const ECONOMY_VERSION = 1

/* ------------------------------------------------------------------ */
/* Challenge types                                                    */
/* ------------------------------------------------------------------ */

/** Progress is derived from accepted gameResults (score + jumpCount):
 *  total_jumps = sum of jumpCount, games_played = count of games,
 *  single_game_score = best score, total_score = sum of score. */
export const CHALLENGE_TYPES = [
  'total_jumps',
  'games_played',
  'single_game_score',
  'total_score',
] as const

export type ChallengeType = (typeof CHALLENGE_TYPES)[number]

/** Stored difficulty values. "normal" is displayed as "Easy" in the UI. */
export const CHALLENGE_DIFFICULTIES = ['normal', 'hard'] as const

export type ChallengeDifficulty = (typeof CHALLENGE_DIFFICULTIES)[number]

/** How many server-generated assignments a day has (exactly 3). */
export const DAILY_CHALLENGE_COUNT = 3

/* ------------------------------------------------------------------ */
/* Cosmetic catalog, free lists and prices                            */
/* ------------------------------------------------------------------ */

/** Same order as birdSkinUrls: classic-1..7 are Bird2-1..7.png, then the
 *  meme birds. Position = sprite index; id = persistent ownership key. */
export const SKIN_IDS = [
  'classic-1',
  'classic-2',
  'classic-3',
  'classic-4',
  'classic-5',
  'classic-6',
  'classic-7',
  'kirk',
  'litvin',
  'mell',
] as const

export type SkinId = (typeof SKIN_IDS)[number]

/** Same order as `backgrounds` in src/sprites.ts (Background1..10). */
export const BACKGROUND_IDS = [
  'sky-1',
  'sky-2',
  'sky-3',
  'sky-4',
  'sky-5',
  'sky-6',
  'sky-7',
  'sky-8',
  'sky-9',
  'sky-10',
] as const

export type BackgroundId = (typeof BACKGROUND_IDS)[number]

/** The 7 permanently free skins, selected from the catalog order once. */
export const FREE_SKIN_IDS: readonly SkinId[] = [
  'classic-1',
  'classic-2',
  'classic-3',
  'classic-4',
  'classic-5',
  'classic-6',
  'classic-7',
]

/** The 3 permanently free backgrounds, selected from the catalog order once. */
export const FREE_BACKGROUND_IDS: readonly BackgroundId[] = [
  'sky-1',
  'sky-2',
  'sky-3',
]

/** Free fallbacks for a selection that is no longer owned. */
export const DEFAULT_SKIN_ID: SkinId = 'classic-1'
export const DEFAULT_BACKGROUND_ID: BackgroundId = 'sky-1'

/** Equipped cosmetics are stored as sprite indices (preferredBird /
 *  preferredBackground), so the defaults are written as their indices. */
export const DEFAULT_SKIN_INDEX = (SKIN_IDS as readonly string[]).indexOf(
  DEFAULT_SKIN_ID,
)
export const DEFAULT_BACKGROUND_INDEX = (
  BACKGROUND_IDS as readonly string[]
).indexOf(DEFAULT_BACKGROUND_ID)

export const PAID_SKIN_PRICE_COINS = 500
export const PAID_BACKGROUND_PRICE_COINS = 1000

const FREE_SKIN_SET: ReadonlySet<string> = new Set(FREE_SKIN_IDS)
const FREE_BACKGROUND_SET: ReadonlySet<string> = new Set(FREE_BACKGROUND_IDS)

export function isSkinId(value: unknown): value is SkinId {
  return (
    typeof value === 'string' && (SKIN_IDS as readonly string[]).includes(value)
  )
}

export function isBackgroundId(value: unknown): value is BackgroundId {
  return (
    typeof value === 'string' &&
    (BACKGROUND_IDS as readonly string[]).includes(value)
  )
}

export function isFreeSkin(value: unknown): value is SkinId {
  return isSkinId(value) && FREE_SKIN_SET.has(value)
}

export function isFreeBackground(value: unknown): value is BackgroundId {
  return isBackgroundId(value) && FREE_BACKGROUND_SET.has(value)
}

/** 0 for a free skin, 500 for a paid one, null for an unknown id. */
export function skinPriceCoins(value: unknown): number | null {
  if (!isSkinId(value)) return null
  return FREE_SKIN_SET.has(value) ? 0 : PAID_SKIN_PRICE_COINS
}

/** 0 for a free background, 1000 for a paid one, null for an unknown id. */
export function backgroundPriceCoins(value: unknown): number | null {
  if (!isBackgroundId(value)) return null
  return FREE_BACKGROUND_SET.has(value) ? 0 : PAID_BACKGROUND_PRICE_COINS
}

/** Sprite index for a skin id (null when the id is not in the catalog). */
export function skinIndexForId(value: unknown): number | null {
  if (!isSkinId(value)) return null
  return (SKIN_IDS as readonly string[]).indexOf(value)
}

/** Skin id at a sprite index (null when the index is out of range). */
export function skinIdForIndex(index: unknown): SkinId | null {
  if (!Number.isInteger(index)) return null
  const n = index as number
  return n >= 0 && n < SKIN_IDS.length ? SKIN_IDS[n] : null
}

/** Sprite index for a background id (null when it is not in the catalog). */
export function backgroundIndexForId(value: unknown): number | null {
  if (!isBackgroundId(value)) return null
  return (BACKGROUND_IDS as readonly string[]).indexOf(value)
}

/** Background id at a sprite index (null when the index is out of range). */
export function backgroundIdForIndex(index: unknown): BackgroundId | null {
  if (!Number.isInteger(index)) return null
  const n = index as number
  return n >= 0 && n < BACKGROUND_IDS.length ? BACKGROUND_IDS[n] : null
}

/* ------------------------------------------------------------------ */
/* Persistent data model (read side)                                  */
/* ------------------------------------------------------------------ */

/** The economy fields of users/{uid} (written and initialized server-side). */
export interface UserEconomy {
  coins: number
  ownedSkinIds: string[]
  ownedBackgroundIds: string[]
  economyVersion: number
}

/**
 * One of the 3 exclusive/day snapshots in
 * users/{uid}/dailyChallenges/{dateKey}.assignments. It is a frozen copy of
 * the configuration at assignment time; claimedAt is null until claimed.
 */
export interface DailyChallengeAssignment {
  id: string
  type: ChallengeType
  difficulty: ChallengeDifficulty
  targetValue: number
  rewardCoins: number
  title: string
  claimedAt: Date | null
}

/** users/{uid}/dailyChallenges/{dateKey} — exactly 3 assignments. */
export interface DailyChallengeSet {
  dateKey: string
  timezone: string
  startsAt: Date
  expiresAt: Date
  assignedAt: Date
  assignments: DailyChallengeAssignment[]
}

/** users/{uid}/challengeClaims/{challengeId} — one payout, written once. */
export interface ChallengeClaim {
  challengeId: string
  rewardCoins: number
  claimedAt: Date
}
