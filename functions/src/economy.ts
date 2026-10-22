/**
 * ECON-01 — challenge economy, cosmetic catalog and the user economy model.
 *
 * This module is the SERVER-SIDE source of truth for:
 *  - the four challenge types and the one allowed target→reward table
 *    (difficulty "normal" | "hard"); a daily assignment may only use a
 *    (type, difficulty, targetValue) triple listed here;
 *  - the cosmetic catalog order, the explicit free lists and the coin prices;
 *  - the persistent economy shapes (users/{uid}, users/{uid}/dailyChallenges/
 *    {dateKey}, users/{uid}/challengeClaims/{challengeId});
 *  - planUserEconomy(), the idempotent initializer applied to every existing
 *    profile.
 *
 * The client copy in src/features/economy.ts mirrors the cosmetic catalog,
 * the free lists, the prices and the challenge vocabulary for rendering; the
 * reward table and the initialization live here, because rewards are money.
 *
 * No purchasing, claiming or daily assignment is implemented in ECON-01.
 */
import type {DocumentData} from "firebase-admin/firestore";

/* ------------------------------------------------------------------ */
/* Challenge types + the allowed reward table                         */
/* ------------------------------------------------------------------ */

/**
 * Every challenge type the economy supports. Progress semantics, for the
 * assignment/claim code that follows in ECON-03:
 *
 *   total_jumps        sum of jumpCount over accepted games in the period
 *   games_played       count of accepted completed games in the period
 *   single_game_score  best score of one accepted game in the period
 *   total_score        sum of score over accepted games in the period
 *
 * `gameResults/{id}` already stores score + jumpCount per run, so progress is
 * derived from those documents — it is never stored on the challenge.
 */
export const CHALLENGE_TYPES = [
  "total_jumps",
  "games_played",
  "single_game_score",
  "total_score",
] as const;

export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

/** Difficulty values. "normal" is DISPLAYED as "Easy" in the UI (ECON-03). */
export const CHALLENGE_DIFFICULTIES = ["normal", "hard"] as const;

export type ChallengeDifficulty = (typeof CHALLENGE_DIFFICULTIES)[number];

/** One allowed goal: reaching targetValue pays rewardCoins. */
export interface ChallengeReward {
  targetValue: number;
  rewardCoins: number;
}

/**
 * The one explicit challenge configuration. A daily assignment is a snapshot
 * of one entry below, so a later change here never rewrites an already
 * assigned day. Nothing else may set a reward.
 */
export const CHALLENGE_REWARDS: Record<
  ChallengeType,
  Record<ChallengeDifficulty, readonly ChallengeReward[]>
> = {
  total_jumps: {
    normal: [
      {targetValue: 20, rewardCoins: 20},
      {targetValue: 40, rewardCoins: 30},
      {targetValue: 60, rewardCoins: 40},
    ],
    hard: [
      {targetValue: 80, rewardCoins: 70},
      {targetValue: 100, rewardCoins: 90},
    ],
  },
  games_played: {
    normal: [
      {targetValue: 5, rewardCoins: 30},
      {targetValue: 10, rewardCoins: 50},
    ],
    hard: [
      {targetValue: 15, rewardCoins: 100},
      {targetValue: 20, rewardCoins: 130},
    ],
  },
  single_game_score: {
    normal: [
      {targetValue: 20, rewardCoins: 30},
      {targetValue: 30, rewardCoins: 45},
      {targetValue: 40, rewardCoins: 60},
    ],
    hard: [
      {targetValue: 50, rewardCoins: 100},
      {targetValue: 60, rewardCoins: 130},
    ],
  },
  total_score: {
    normal: [
      {targetValue: 100, rewardCoins: 25},
      {targetValue: 150, rewardCoins: 35},
      {targetValue: 200, rewardCoins: 45},
      {targetValue: 250, rewardCoins: 55},
    ],
    hard: [
      {targetValue: 300, rewardCoins: 90},
      {targetValue: 350, rewardCoins: 105},
      {targetValue: 400, rewardCoins: 120},
      {targetValue: 450, rewardCoins: 135},
      {targetValue: 500, rewardCoins: 150},
    ],
  },
};

export function isChallengeType(value: unknown): value is ChallengeType {
  return (
    typeof value === "string" &&
    (CHALLENGE_TYPES as readonly string[]).includes(value)
  );
}

export function isChallengeDifficulty(
  value: unknown,
): value is ChallengeDifficulty {
  return (
    typeof value === "string" &&
    (CHALLENGE_DIFFICULTIES as readonly string[]).includes(value)
  );
}

/** The allowed goals for a type+difficulty, or null for an unknown pair. */
export function allowedChallengeRewards(
  type: unknown,
  difficulty: unknown,
): readonly ChallengeReward[] | null {
  if (!isChallengeType(type) || !isChallengeDifficulty(difficulty)) return null;
  return CHALLENGE_REWARDS[type][difficulty];
}

/**
 * The coin reward for an exact (type, difficulty, targetValue) triple, or null
 * when the combination is not in the configuration. Assignments and claims
 * both go through this, so an unlisted target can never pay out.
 */
export function challengeReward(
  type: unknown,
  difficulty: unknown,
  targetValue: unknown,
): number | null {
  if (!isChallengeType(type) || !isChallengeDifficulty(difficulty)) return null;
  if (typeof targetValue !== "number" || !Number.isInteger(targetValue)) {
    return null;
  }
  const entry = CHALLENGE_REWARDS[type][difficulty].find(
    (reward) => reward.targetValue === targetValue,
  );
  return entry ? entry.rewardCoins : null;
}

/* ------------------------------------------------------------------ */
/* Cosmetic catalog, free lists and prices                            */
/* ------------------------------------------------------------------ */

/**
 * Skin ids in the SAME order as `birdSkinUrls` in
 * src/features/game/sprites.ts (the seven classic Bird2-N sheets, then the
 * three meme birds). The position is the sprite index the game renderer uses;
 * the id is the STABLE identity that ownership is stored under, so reordering
 * the assets cannot silently change who owns what.
 */
export const SKIN_IDS = [
  "classic-1",
  "classic-2",
  "classic-3",
  "classic-4",
  "classic-5",
  "classic-6",
  "classic-7",
  "kirk",
  "litvin",
  "mell",
] as const;

export type SkinId = (typeof SKIN_IDS)[number];

/**
 * Background ids in the SAME order as `backgrounds` in src/sprites.ts
 * (Background1..Background10).
 */
export const BACKGROUND_IDS = [
  "sky-1",
  "sky-2",
  "sky-3",
  "sky-4",
  "sky-5",
  "sky-6",
  "sky-7",
  "sky-8",
  "sky-9",
  "sky-10",
] as const;

export type BackgroundId = (typeof BACKGROUND_IDS)[number];

/**
 * The 7 permanently free skins — written out once, selected from the catalog
 * order above. Free ownership is decided by these ids, never by an array
 * index at runtime.
 */
export const FREE_SKIN_IDS: readonly SkinId[] = [
  "classic-1",
  "classic-2",
  "classic-3",
  "classic-4",
  "classic-5",
  "classic-6",
  "classic-7",
];

/** The 3 permanently free backgrounds — the first three catalog entries. */
export const FREE_BACKGROUND_IDS: readonly BackgroundId[] = [
  "sky-1",
  "sky-2",
  "sky-3",
];

/** Fallbacks used when a selected cosmetic is no longer owned. */
export const DEFAULT_SKIN_ID: SkinId = "classic-1";
export const DEFAULT_BACKGROUND_ID: BackgroundId = "sky-1";

/** Equipped cosmetics are still stored as sprite indices on users/{uid}
 *  (preferredBird / preferredBackground — the UI-04 preference fields), so a
 *  replacement is written as the index of the free default. */
export const DEFAULT_SKIN_INDEX = SKIN_IDS.indexOf(DEFAULT_SKIN_ID);
export const DEFAULT_BACKGROUND_INDEX = BACKGROUND_IDS.indexOf(
  DEFAULT_BACKGROUND_ID,
);

/** Every paid skin costs the same, regardless of which one it is. */
export const PAID_SKIN_PRICE_COINS = 500;
/** Every paid background costs the same. */
export const PAID_BACKGROUND_PRICE_COINS = 1000;

const FREE_SKIN_SET: ReadonlySet<string> = new Set(FREE_SKIN_IDS);
const FREE_BACKGROUND_SET: ReadonlySet<string> = new Set(FREE_BACKGROUND_IDS);

export function isSkinId(value: unknown): value is SkinId {
  return (
    typeof value === "string" && (SKIN_IDS as readonly string[]).includes(value)
  );
}

export function isBackgroundId(value: unknown): value is BackgroundId {
  return (
    typeof value === "string" &&
    (BACKGROUND_IDS as readonly string[]).includes(value)
  );
}

export function isFreeSkin(value: unknown): value is SkinId {
  return isSkinId(value) && FREE_SKIN_SET.has(value);
}

export function isFreeBackground(value: unknown): value is BackgroundId {
  return isBackgroundId(value) && FREE_BACKGROUND_SET.has(value);
}

/** 0 for a free skin, 500 for a paid one, null for an unknown id. */
export function skinPriceCoins(value: unknown): number | null {
  if (!isSkinId(value)) return null;
  return FREE_SKIN_SET.has(value) ? 0 : PAID_SKIN_PRICE_COINS;
}

/** 0 for a free background, 1000 for a paid one, null for an unknown id. */
export function backgroundPriceCoins(value: unknown): number | null {
  if (!isBackgroundId(value)) return null;
  return FREE_BACKGROUND_SET.has(value) ? 0 : PAID_BACKGROUND_PRICE_COINS;
}

/* ------------------------------------------------------------------ */
/* Persistent data model                                              */
/* ------------------------------------------------------------------ */

/**
 * Economy schema version, stored as users/{uid}.economyVersion so a later
 * migration can tell an initialized profile from a legacy one. A newer version
 * written by a newer deploy is preserved, never downgraded.
 */
export const ECONOMY_VERSION = 1;

/** The economy fields of users/{uid}, after initialization. */
export interface UserEconomy {
  coins: number;
  ownedSkinIds: string[];
  ownedBackgroundIds: string[];
  economyVersion: number;
}

/**
 * One of the exactly 3 daily challenge snapshots stored on
 * users/{uid}/dailyChallenges/{dateKey}.assignedAt — a copy of the
 * configuration at assignment time, so editing CHALLENGE_REWARDS later cannot
 * change an assigned day. claimedAt is null until the reward is claimed.
 */
export interface DailyChallengeAssignment {
  id: string;
  type: ChallengeType;
  difficulty: ChallengeDifficulty;
  targetValue: number;
  rewardCoins: number;
  title: string;
  claimedAt: Date | null;
}

/** A day's assignment document; exactly DAILY_CHALLENGE_COUNT assignments. */
export interface DailyChallengeSet {
  dateKey: string;
  timezone: string;
  startsAt: Date;
  expiresAt: Date;
  assignedAt: Date;
  assignments: DailyChallengeAssignment[];
}

/** users/{uid}/challengeClaims/{challengeId} — one payout, written once. */
export interface ChallengeClaim {
  challengeId: string;
  rewardCoins: number;
  claimedAt: Date;
}

/** How many challenges a day gets. */
export const DAILY_CHALLENGE_COUNT = 3;

/* ------------------------------------------------------------------ */
/* Backward-compatible, idempotent initialization                     */
/* ------------------------------------------------------------------ */

/**
 * The fields to merge into users/{uid}. Only fields that need fixing appear,
 * so a correctly initialized profile produces an EMPTY patch and the login
 * path performs no economy write for it.
 */
export interface UserEconomyPatch {
  coins?: number;
  ownedSkinIds?: string[];
  ownedBackgroundIds?: string[];
  economyVersion?: number;
  /** Sprite index; only present when a locked selection was replaced. */
  preferredBird?: number;
  preferredBackground?: number;
}

export interface UserEconomyPlan {
  patch: UserEconomyPatch;
  /** Effective state once `patch` is applied. */
  economy: UserEconomy;
}

/** The economy fields for a NEW users/{uid} document. */
export function initialUserEconomy(): UserEconomy {
  return {
    coins: 0,
    ownedSkinIds: [...FREE_SKIN_IDS],
    ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
    economyVersion: ECONOMY_VERSION,
  };
}

/** Valid balance, or 0 when the field is absent/corrupt. */
function readCoins(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

/**
 * Effective ownership: the stored ids that exist in the catalog, united with
 * the free ids, in catalog order. Unknown ids are not ownership (the catalog
 * above is the complete set).
 */
function readOwnedIds(
  value: unknown,
  catalog: readonly string[],
  free: readonly string[],
): {ids: string[]; changed: boolean} {
  const stored = Array.isArray(value) ? value : [];
  const keep = new Set<string>();
  for (const entry of stored) {
    if (typeof entry === "string" && catalog.includes(entry)) keep.add(entry);
  }
  for (const id of free) keep.add(id);
  const ids = catalog.filter((id) => keep.has(id));
  const changed =
    stored.length !== ids.length ||
    stored.some((entry, index) => entry !== ids[index]);
  return {ids, changed};
}

/** Stored version when it is current or newer, else ECONOMY_VERSION. */
function readEconomyVersion(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= ECONOMY_VERSION
    ? value
    : ECONOMY_VERSION;
}

/**
 * The equipped sprite index when it still points at an owned cosmetic; the
 * free default otherwise. An unset (null/undefined) selection stays unset —
 * the renderer already defaults to index 0.
 */
function readEquippedIndex(
  value: unknown,
  catalog: readonly string[],
  ownedIds: readonly string[],
  fallback: number,
): number | undefined {
  if (value === null || value === undefined) return undefined;
  const index =
    typeof value === "number" && Number.isInteger(value) ? value : -1;
  const id = index >= 0 ? catalog[index] : undefined;
  if (id !== undefined && ownedIds.includes(id)) return index;
  return fallback;
}

/**
 * ECON-01 — the backward-compatible initializer, as a pure function.
 *
 * Given the current users/{uid} data (or undefined), returns the patch that
 * brings it onto the economy model plus the resulting state:
 *  - a missing/corrupt balance becomes 0, an existing balance is preserved;
 *  - every user owns the 7 free skins and 3 free backgrounds, in addition to
 *    whatever legitimate ids they already own;
 *  - an equipped skin/background that is no longer owned is replaced by the
 *    free default;
 *  - a current/newer economyVersion is preserved.
 *
 * Idempotent: running it on an already initialized profile returns an empty
 * patch, so callers can invoke it on every login without overwriting anything.
 * Call it INSIDE a Firestore transaction (both profile-upsert paths in
 * index.ts do) so concurrent initializations resolve to one state.
 */
export function planUserEconomy(
  existing: DocumentData | undefined,
): UserEconomyPlan {
  const data: DocumentData = existing ?? {};
  const patch: UserEconomyPatch = {};

  const coins = readCoins(data.coins);
  if (data.coins !== coins) patch.coins = coins;

  const skins = readOwnedIds(data.ownedSkinIds, SKIN_IDS, FREE_SKIN_IDS);
  if (skins.changed) patch.ownedSkinIds = skins.ids;

  const backgrounds = readOwnedIds(
    data.ownedBackgroundIds,
    BACKGROUND_IDS,
    FREE_BACKGROUND_IDS,
  );
  if (backgrounds.changed) patch.ownedBackgroundIds = backgrounds.ids;

  const economyVersion = readEconomyVersion(data.economyVersion);
  if (data.economyVersion !== economyVersion) {
    patch.economyVersion = economyVersion;
  }

  // Equipped cosmetics are the UI-04 preference indices (see preview selection
  // in src/features/birdSkin.ts / homeBackground.ts) — not duplicated into new
  // equippedSkinId/equippedBackgroundId fields.
  const preferredBird = readEquippedIndex(
    data.preferredBird,
    SKIN_IDS,
    skins.ids,
    DEFAULT_SKIN_INDEX,
  );
  if (preferredBird !== undefined && preferredBird !== data.preferredBird) {
    patch.preferredBird = preferredBird;
  }

  const preferredBackground = readEquippedIndex(
    data.preferredBackground,
    BACKGROUND_IDS,
    backgrounds.ids,
    DEFAULT_BACKGROUND_INDEX,
  );
  if (
    preferredBackground !== undefined &&
    preferredBackground !== data.preferredBackground
  ) {
    patch.preferredBackground = preferredBackground;
  }

  return {
    patch,
    economy: {
      coins,
      ownedSkinIds: skins.ids,
      ownedBackgroundIds: backgrounds.ids,
      economyVersion,
    },
  };
}
