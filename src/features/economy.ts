// ECON-01 — challenge economy configuration and data contracts (client copy).
//
// MIRROR: functions/src/economy.ts owns the server copy. The two toolchains
// cannot share one file (Cloud Functions deploys only its own directory), so
// every exported value below must stay value-identical to that file — pinned
// by src/features/economy.test.ts, which deep-compares both copies. Change
// them together.
//
// Pure by design (no React, no firebase imports): the daily-challenge UI and
// purchase screens arriving in later ECON tasks read these tiers, prices and
// free IDs, and nothing here writes Firestore — economy writes are server-only
// (initializeEconomy / the future claim + purchase callables).
//
// Difficulty "normal" is DISPLAYED as "Easy" (i18n label, later task); the
// stored value stays "normal" exactly as in the server config.

/** Schema stamp for the users/{uid} economy fields (server-applied). */
export const ECONOMY_VERSION = 1

/** How many server-generated assignments one daily challenge document holds. */
export const DAILY_CHALLENGE_COUNT = 3

/* ------------------------------------------------------------------ */
/* Challenge types + difficulty tiers.                                 */
/* ------------------------------------------------------------------ */

/** The four economy challenge types (ECON-01). All four now also back the
 *  admin challenges (CH-04 extended the CRUD to this full list) — see
 *  ./challenges.ts. Legacy challenges without a reward configuration remain
 *  viewable and non-rewarding until explicitly edited into a valid tier. */
export const CHALLENGE_TYPES = [
  'total_jumps',
  'games_played',
  'single_game_score',
  'total_score',
] as const

export type EconomyChallengeType = (typeof CHALLENGE_TYPES)[number]

/** Stored difficulty values; the UI labels 'normal' as 'Easy'. */
export const CHALLENGE_DIFFICULTIES = ['normal', 'hard'] as const

export type ChallengeDifficulty = (typeof CHALLENGE_DIFFICULTIES)[number]

export interface ChallengeTier {
  /** The tier's target value for the challenge type. */
  targetValue: number
  /** Coins paid out when this tier is claimed. */
  rewardCoins: number
}

/** THE tier table (ECON-01) — mirrors functions/src/economy.ts exactly.
 *  Anything outside these triples has no reward (lookupTierReward → null). */
export const CHALLENGE_TIERS: Record<
  EconomyChallengeType,
  Record<ChallengeDifficulty, readonly ChallengeTier[]>
> = {
  total_jumps: {
    normal: [
      { targetValue: 20, rewardCoins: 20 },
      { targetValue: 40, rewardCoins: 30 },
      { targetValue: 60, rewardCoins: 40 },
    ],
    hard: [
      { targetValue: 80, rewardCoins: 70 },
      { targetValue: 100, rewardCoins: 90 },
    ],
  },
  games_played: {
    normal: [
      { targetValue: 5, rewardCoins: 30 },
      { targetValue: 10, rewardCoins: 50 },
    ],
    hard: [
      { targetValue: 15, rewardCoins: 100 },
      { targetValue: 20, rewardCoins: 130 },
    ],
  },
  single_game_score: {
    normal: [
      { targetValue: 20, rewardCoins: 30 },
      { targetValue: 30, rewardCoins: 45 },
      { targetValue: 40, rewardCoins: 60 },
    ],
    hard: [
      { targetValue: 50, rewardCoins: 100 },
      { targetValue: 60, rewardCoins: 130 },
    ],
  },
  total_score: {
    normal: [
      { targetValue: 100, rewardCoins: 25 },
      { targetValue: 150, rewardCoins: 35 },
      { targetValue: 200, rewardCoins: 45 },
      { targetValue: 250, rewardCoins: 55 },
    ],
    hard: [
      { targetValue: 300, rewardCoins: 90 },
      { targetValue: 350, rewardCoins: 105 },
      { targetValue: 400, rewardCoins: 120 },
      { targetValue: 450, rewardCoins: 135 },
      { targetValue: 500, rewardCoins: 150 },
    ],
  },
}

/** Reward for an allowed type/difficulty/target triple, or null when the
 *  combination is not in the table. `unknown` on purpose — form/UI input is
 *  unvalidated when it reaches here. */
export function lookupTierReward(
  type: unknown,
  difficulty: unknown,
  targetValue: unknown,
): number | null {
  if (typeof type !== 'string' || typeof difficulty !== 'string') return null
  const tiers: Record<ChallengeDifficulty, readonly ChallengeTier[]> | undefined =
    CHALLENGE_TIERS[type as EconomyChallengeType]
  if (!tiers) return null
  const list: readonly ChallengeTier[] | undefined =
    tiers[difficulty as ChallengeDifficulty]
  if (!list) return null
  const tier = list.find((candidate) => candidate.targetValue === targetValue)
  return tier ? tier.rewardCoins : null
}

/* ------------------------------------------------------------------ */
/* Gameplay coins (ECON-03).                                            */
/* ------------------------------------------------------------------ */

/** Score points needed for one gameplay coin (1 coin per full 5 points).
 *  MUST mirror COINS_PER_SCORE_POINTS in functions/src/economy.ts. */
export const COINS_PER_SCORE_POINTS = 5

/**
 * ECON-03 — coins for one finished run: floor(score / 5), per game, no
 * remainder carry-over. The SERVER owns the awarded amount; this copy exists
 * so the gameplay HUD preview and the docs/tests use the same formula (pinned
 * against the server mirror in economy.test.ts).
 */
export function coinsForScore(score: unknown): number {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) {
    return 0
  }
  return Math.floor(score / COINS_PER_SCORE_POINTS)
}

/* ------------------------------------------------------------------ */
/* Cosmetic catalogs + pricing.                                        */
/* ------------------------------------------------------------------ */

/*
 * IDs are the lowercased asset file names, in EXACTLY the catalog order of
 * birdSkinUrls (features/game/sprites.ts) and backgrounds (sprites.ts) — the
 * same alignment UI-04's stored preferredBird/preferredBackground indices
 * rely on. The free sets were chosen ONCE from that order; ownership is
 * always decided against these explicit lists, never by a runtime index.
 */

export const SKIN_IDS = [
  'bird2-1',
  'bird2-2',
  'bird2-3',
  'bird2-4',
  'bird2-5',
  'bird2-6',
  'bird2-7',
  'kirkbird',
  'litvinbird',
  'mellbird',
  'redbirdsmall',
] as const

/** The 7 skins every account owns from the start (ECON-01). */
export const FREE_SKIN_IDS: readonly string[] = [
  'bird2-1',
  'bird2-2',
  'bird2-3',
  'bird2-4',
  'bird2-5',
  'bird2-6',
  'bird2-7',
]

export const BACKGROUND_IDS = [
  'background1',
  'background2',
  'background3',
  'background4',
  'background5',
  'background6',
  'background7',
  'background8',
  'background9',
  'background10',
] as const

/** The 3 backgrounds every account owns from the start (ECON-01). */
export const FREE_BACKGROUND_IDS: readonly string[] = [
  'background1',
  'background2',
  'background3',
]

/** Price of a paid skin — any catalog skin not in FREE_SKIN_IDS. */
export const PAID_SKIN_PRICE = 500
/** Price of a paid background — any catalog sky not in FREE_BACKGROUND_IDS. */
export const PAID_BACKGROUND_PRICE = 1000

/** Free default for a repaired/unset equipped pick (catalog index 0). */
export const DEFAULT_SKIN_INDEX = 0
export const DEFAULT_BACKGROUND_INDEX = 0

/** Free-ownership check by EXPLICIT id — never `index < 7` at runtime. */
export function isFreeSkinId(id: unknown): boolean {
  return typeof id === 'string' && FREE_SKIN_IDS.includes(id)
}

/** Free-ownership check by EXPLICIT id — never `index < 3` at runtime. */
export function isFreeBackgroundId(id: unknown): boolean {
  return typeof id === 'string' && FREE_BACKGROUND_IDS.includes(id)
}

/** The two purchasable cosmetic kinds (grounds have no economy). */
export type CosmeticKind = 'skin' | 'background'

/** Catalog id at an index, or null when the index is not a catalog entry. */
export function cosmeticIdAt(
  kind: CosmeticKind,
  index: unknown,
): string | null {
  if (typeof index !== 'number' || !Number.isInteger(index)) return null
  const catalog = kind === 'skin' ? SKIN_IDS : BACKGROUND_IDS
  return (catalog as readonly string[])[index] ?? null
}

/** Server-derived price for a catalog id; null when it is not in that catalog.
 *  The client uses this only for the label — the callable re-derives it. */
export function cosmeticPrice(
  kind: CosmeticKind,
  id: unknown,
): number | null {
  if (typeof id !== 'string') return null
  if (kind === 'skin') {
    if (!(SKIN_IDS as readonly string[]).includes(id)) return null
    return isFreeSkinId(id) ? 0 : PAID_SKIN_PRICE
  }
  if (!(BACKGROUND_IDS as readonly string[]).includes(id)) return null
  return isFreeBackgroundId(id) ? 0 : PAID_BACKGROUND_PRICE
}

/** True when the profile may EQUIP the cosmetic at this catalog index: free
 *  ids always, paid ids only while the server-provided ownership list has
 *  them. Mirrors canEquipCosmetic in functions/src/economy.ts. */
export function ownsCosmeticIndex(
  profile: {
    ownedSkinIds?: readonly string[]
    ownedBackgroundIds?: readonly string[]
  },
  kind: CosmeticKind,
  index: unknown,
): boolean {
  const id = cosmeticIdAt(kind, index)
  if (id === null) return false
  if (kind === 'skin') {
    return isFreeSkinId(id) || (profile.ownedSkinIds ?? []).includes(id)
  }
  return isFreeBackgroundId(id) || (profile.ownedBackgroundIds ?? []).includes(id)
}

/* ------------------------------------------------------------------ */
/* Persistent data model (client read shapes).                         */
/* ------------------------------------------------------------------ */

/** Firestore timestamps arrive as objects with toDate() — the same duck type
 *  UserProfile.acceptedDataProcessingAt uses. */
interface FirestoreDate {
  toDate(): Date
}

/** One server-generated tier inside a daily challenge document. */
export interface DailyChallengeAssignment {
  /** Stable id (the challengeClaims/{id} path segment). */
  id: string
  type: EconomyChallengeType
  difficulty: ChallengeDifficulty
  targetValue: number
  rewardCoins: number
  /** Title snapshotted from the assignment generator. */
  title: string
  /** null until the player claims this tier. */
  claimedAt: FirestoreDate | null
}

/** users/{uid}/dailyChallenges/{dateKey} — one per local challenge day.
 *  The economy fields of users/{uid} itself live on UserProfile
 *  (features/userProfile.ts); equipped cosmetics stay preferredBird /
 *  preferredBackground (catalog indices), so no duplicate state. */
export interface DailyChallengeDoc {
  /** 'YYYY-MM-DD' — the player's local challenge day (the path segment). */
  dateKey: string
  /** IANA timezone the dateKey was computed in (e.g. 'Europe/Riga'). */
  timezone: string
  startsAt: FirestoreDate
  expiresAt: FirestoreDate
  assignedAt: FirestoreDate
  /** Exactly DAILY_CHALLENGE_COUNT server-generated snapshots. */
  assignments: readonly [
    DailyChallengeAssignment,
    DailyChallengeAssignment,
    DailyChallengeAssignment,
  ]
}

/** users/{uid}/challengeClaims/{challengeId} — one doc per claimed tier. */
export interface ChallengeClaimDoc {
  challengeId: string
  rewardCoins: number
  claimedAt: FirestoreDate
}
