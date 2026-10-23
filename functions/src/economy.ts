/**
 * ECON-01 — the challenge economy configuration and data contracts.
 *
 * The ONE explicit configuration for the economy:
 *   - the four challenge types with their per-difficulty target/reward tiers,
 *   - the cosmetic catalogs with the EXPLICIT free IDs (7 skins, 3 backgrounds)
 *     and the paid prices (500 / 1000 coins),
 *   - the users/{uid} + dailyChallenges + challengeClaims document shapes,
 *   - buildEconomyPatch: the pure backfill rules initializeEconomy applies.
 *
 * MIRROR: birdenergy/src/features/economy.ts holds the client copy. The two
 * toolchains cannot share one file (Cloud Functions deploys only its own
 * directory), so every exported VALUE here must stay value-identical to that
 * file — pinned by birdenergy/src/features/economy.test.ts, which deep-compares
 * both copies. Change them together.
 *
 * Deliberately dependency-free (no firebase imports): the pure helpers run
 * directly in unit tests, and the client's cross-check test can import this
 * file without dragging firebase-admin into the browser-side test run.
 *
 * NOT in this task (later ECON tasks): daily assignment generation, reward
 * claiming, cosmetic purchases, ownership-gating UI.
 */

/** Schema stamp for the users/{uid} economy fields — see buildEconomyPatch. */
export const ECONOMY_VERSION = 1;

/** How many server-generated assignments one daily challenge document holds. */
export const DAILY_CHALLENGE_COUNT = 3;

/* ------------------------------------------------------------------ */
/* Challenge types + difficulty tiers.                                 */
/* ------------------------------------------------------------------ */

/**
 * Exactly the four economy challenge types (ECON-01 spec):
 *   total_jumps       sum of jumpCount over accepted games in the period
 *   games_played      count of accepted completed games in the period
 *   single_game_score max score in one accepted game in the period
 *   total_score       sum of score over accepted games in the period
 *
 * All four also back the admin challenges (CH-01/ADM-01, extended to this
 * full list by CH-04); existing challenges/{id} documents keep working
 * unchanged — legacy docs WITHOUT a difficulty/reward configuration stay
 * viewable and non-rewarding until an admin explicitly edits them into a
 * valid tier triple (lookupTierReward rejects anything else).
 */
export const CHALLENGE_TYPES = [
  "total_jumps",
  "games_played",
  "single_game_score",
  "total_score",
] as const;

export type EconomyChallengeType = (typeof CHALLENGE_TYPES)[number];

/**
 * Stored difficulty values. "normal" is DISPLAYED as "Easy" in the UI (the
 * i18n layer maps the label later) — never rename the stored value itself.
 */
export const CHALLENGE_DIFFICULTIES = ["normal", "hard"] as const;

export type ChallengeDifficulty = (typeof CHALLENGE_DIFFICULTIES)[number];

export interface ChallengeTier {
  /** The tier's target value for the challenge type. */
  targetValue: number;
  /** Coins paid out when this tier is claimed. */
  rewardCoins: number;
}

/**
 * THE tier table (ECON-01). Ascending per cell; nothing outside these exact
 * type/difficulty/target triples is a valid assignment — lookupTierReward
 * rejects everything else instead of guessing a reward.
 */
export const CHALLENGE_TIERS: Record<
  EconomyChallengeType,
  Record<ChallengeDifficulty, readonly ChallengeTier[]>
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

/**
 * Reward for an allowed type/difficulty/target triple, or null when the
 * combination is not in the table. Parameters are typed `unknown` on purpose:
 * assignment generation, later validation steps and tests all feed it
 * unvalidated shapes, so a wrong triple must never pay out by accident.
 */
export function lookupTierReward(
  type: unknown,
  difficulty: unknown,
  targetValue: unknown,
): number | null {
  if (typeof type !== "string" || typeof difficulty !== "string") return null;
  const tiers: Record<ChallengeDifficulty, readonly ChallengeTier[]> | undefined =
    CHALLENGE_TIERS[type as EconomyChallengeType];
  if (!tiers) return null;
  const list: readonly ChallengeTier[] | undefined =
    tiers[difficulty as ChallengeDifficulty];
  if (!list) return null;
  const tier = list.find((candidate) => candidate.targetValue === targetValue);
  return tier ? tier.rewardCoins : null;
}

/* ------------------------------------------------------------------ */
/* Cosmetic catalogs + pricing.                                        */
/* ------------------------------------------------------------------ */

/*
 * IDs are the lowercased asset file names, in EXACTLY the catalog order used
 * by birdSkinUrls (src/features/game/sprites.ts) and backgrounds
 * (src/sprites.ts) — the index alignment is what lets UI-04's stored indices
 * map onto these ids. The free sets below were chosen ONCE from that order
 * (the seven classic sheets, the first three skies): ownership is always
 * decided against these explicit lists, never by a runtime array index.
 */

export const SKIN_IDS = [
  "bird2-1",
  "bird2-2",
  "bird2-3",
  "bird2-4",
  "bird2-5",
  "bird2-6",
  "bird2-7",
  "kirkbird",
  "litvinbird",
  "mellbird",
  "redbirdsmall",
] as const;

/** The 7 skins every account owns from the start (ECON-01). */
export const FREE_SKIN_IDS: readonly string[] = [
  "bird2-1",
  "bird2-2",
  "bird2-3",
  "bird2-4",
  "bird2-5",
  "bird2-6",
  "bird2-7",
];

export const BACKGROUND_IDS = [
  "background1",
  "background2",
  "background3",
  "background4",
  "background5",
  "background6",
  "background7",
  "background8",
  "background9",
  "background10",
] as const;

/** The 3 backgrounds every account owns from the start (ECON-01). */
export const FREE_BACKGROUND_IDS: readonly string[] = [
  "background1",
  "background2",
  "background3",
];

/** Price of a paid skin — any catalog skin not in FREE_SKIN_IDS. */
export const PAID_SKIN_PRICE = 500;
/** Price of a paid background — any catalog sky not in FREE_BACKGROUND_IDS. */
export const PAID_BACKGROUND_PRICE = 1000;

/** Equipped cosmetics fall back to this catalog index when the stored pick is
 *  out of range or no longer owned; entry 0 of both catalogs is free. */
export const DEFAULT_SKIN_INDEX = 0;
export const DEFAULT_BACKGROUND_INDEX = 0;

/* ------------------------------------------------------------------ */
/* Persistent data model.                                              */
/* ------------------------------------------------------------------ */

/**
 * The economy slice of users/{uid} (ECON-01):
 *   coins                balance; 0 while absent on legacy documents
 *   ownedSkinIds         catalog ids the account owns (starts = free grants)
 *   ownedBackgroundIds   same for skies
 *   economyVersion       ECONOMY_VERSION stamp — see buildEconomyPatch
 *
 * Equipped cosmetics are NOT duplicated here: UI-04 already stores them as
 * catalog indices in preferredBird / preferredBackground / preferredGround
 * (hydrated into localStorage on sign-in), and initializeEconomy reuses those.
 * Grounds are not part of the economy (no price, no ownership list).
 */
export interface EconomyUserFields {
  coins: number;
  ownedSkinIds: string[];
  ownedBackgroundIds: string[];
  economyVersion: number;
}

/** One server-generated tier inside a daily challenge document. */
export interface DailyChallengeAssignment {
  /** Stable id (used as the challengeClaims/{id} path segment). */
  id: string;
  type: EconomyChallengeType;
  difficulty: ChallengeDifficulty;
  targetValue: number;
  rewardCoins: number;
  /** Title snapshotted from the assignment generator. */
  title: string;
  /** null until the player claims this tier. */
  claimedAt: Date | null;
}

/**
 * users/{uid}/dailyChallenges/{dateKey} — one document per local challenge
 * day. Timestamps are written as Date; Firestore hands them back as Timestamps
 * (duck-typed toDate() everywhere else in this codebase) on read.
 */
export interface DailyChallengeDoc {
  /** 'YYYY-MM-DD' — the player's local challenge day (the path segment). */
  dateKey: string;
  /** IANA timezone the dateKey was computed in (e.g. 'Europe/Riga'). */
  timezone: string;
  startsAt: Date;
  expiresAt: Date;
  assignedAt: Date;
  /** Exactly DAILY_CHALLENGE_COUNT server-generated snapshots. */
  assignments: readonly [
    DailyChallengeAssignment,
    DailyChallengeAssignment,
    DailyChallengeAssignment,
  ];
}

/** users/{uid}/challengeClaims/{challengeId} — one doc per claimed tier. */
export interface ChallengeClaimDoc {
  challengeId: string;
  rewardCoins: number;
  claimedAt: Date;
}

/* ------------------------------------------------------------------ */
/* Backfill rules (pure) — applied by economyInit.initializeEconomy.   */
/* ------------------------------------------------------------------ */

/** Ids that exist in the catalog AND are granted (free) or already owned,
 *  emitted in catalog order so the comparison below is stable. Unknown or
 *  non-string stored ids are corrupt and do not count as ownership. */
function mergeOwned(
  catalog: readonly string[],
  free: readonly string[],
  stored: unknown,
): string[] {
  const owned = new Set<string>(free);
  if (Array.isArray(stored)) {
    for (const id of stored) {
      if (typeof id === "string" && catalog.includes(id)) owned.add(id);
    }
  }
  return catalog.filter((id) => owned.has(id));
}

function sameIdList(stored: unknown, next: readonly string[]): boolean {
  if (!Array.isArray(stored) || stored.length !== next.length) return false;
  return next.every((id, i) => stored[i] === id);
}

/** True when the stored catalog index points at an id the account owns. */
function ownsAt(
  catalog: readonly string[],
  owned: readonly string[],
  index: unknown,
): boolean {
  if (typeof index !== "number" || !Number.isInteger(index)) return false;
  const id: string | undefined = catalog[index];
  return id !== undefined && owned.includes(id);
}

/**
 * The exact patch to apply to users/{uid} to bring its economy fields up to
 * date — an already-current document yields {} (idempotent: no write at all).
 *
 * Rules (ECON-01):
 *   - coins absent / not a finite non-negative number → 0; an established
 *     balance is never touched,
 *   - ownership → union of the free grants with the stored catalog-valid ids
 *     (established, legitimate ownership is preserved; unknown ids dropped),
 *   - equipped preferredBird/preferredBackground → kept only while the stored
 *     index still maps to an owned id, otherwise replaced with the free
 *     default (a previously selected but now-locked cosmetic),
 *   - economyVersion → filled or raised to ECONOMY_VERSION, never lowered.
 */
export function buildEconomyPatch(
  profile: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const data: Record<string, unknown> = profile ?? {};
  const patch: Record<string, unknown> = {};

  const coins = data.coins;
  if (typeof coins !== "number" || !Number.isFinite(coins) || coins < 0) {
    patch.coins = 0;
  }

  const ownedSkins = mergeOwned(SKIN_IDS, FREE_SKIN_IDS, data.ownedSkinIds);
  if (!sameIdList(data.ownedSkinIds, ownedSkins)) {
    patch.ownedSkinIds = ownedSkins;
  }

  const ownedBackgrounds = mergeOwned(
    BACKGROUND_IDS,
    FREE_BACKGROUND_IDS,
    data.ownedBackgroundIds,
  );
  if (!sameIdList(data.ownedBackgroundIds, ownedBackgrounds)) {
    patch.ownedBackgroundIds = ownedBackgrounds;
  }

  // Equipped cosmetics live in preferredBird/preferredBackground (UI-04
  // stores catalog INDICES — no duplicate equippedSkinId field). Only a
  // present-but-unowned pick is repaired; an absent field stays absent.
  if (
    "preferredBird" in data &&
    !ownsAt(SKIN_IDS, ownedSkins, data.preferredBird)
  ) {
    patch.preferredBird = DEFAULT_SKIN_INDEX;
  }
  if (
    "preferredBackground" in data &&
    !ownsAt(BACKGROUND_IDS, ownedBackgrounds, data.preferredBackground)
  ) {
    patch.preferredBackground = DEFAULT_BACKGROUND_INDEX;
  }

  const version = data.economyVersion;
  if (
    typeof version !== "number" ||
    !Number.isFinite(version) ||
    version < ECONOMY_VERSION
  ) {
    patch.economyVersion = ECONOMY_VERSION;
  }

  return patch;
}
