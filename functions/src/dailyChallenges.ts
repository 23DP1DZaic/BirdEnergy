/**
 * CH-05 — automatic personal daily challenge assignment.
 *
 * Everything here runs server-side only: getDailyChallenges (index.ts) never
 * accepts a date, a timezone or a set of assignments from the client.
 *
 * Day boundaries are the calendar day in Europe/Riga, as the half-open window
 * [local midnight, next local midnight). Boundaries are DERIVED with Intl from
 * the IANA zone instead of assuming UTC+2/UTC+3 or a 24-hour day: the EU
 * daylight-saving switches make the spring day 23 hours and the autumn day 25
 * hours, and both produce a correct, contiguous pair of bounds.
 *
 * Assignment rules (task CH-05):
 *   - exactly DAILY_CHALLENGE_COUNT (3) assignments per day,
 *   - two "normal" and exactly one "hard",
 *   - three DISTINCT types out of the four economy types,
 *   - target + reward copied from the one ECON-01 tier table (snapshots),
 *   - claimedAt starts as null.
 *
 * Stored documents are authoritative: repeated calls return the stored set,
 * no matter how many tabs or devices ask. Only a missing document is created
 * (inside a transaction, so concurrent first calls settle on one set), and a
 * corrupt stored shape is regenerated rather than returned half-broken.
 *
 * Progress is calculated from accepted gameResults rows inside the day window
 * — no progress is stored (same architecture as the admin challenges, see
 * src/features/challenges.ts).
 */

import type {Firestore} from "firebase-admin/firestore";
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_TIERS,
  CHALLENGE_TYPES,
  DAILY_CHALLENGE_COUNT,
  lookupTierReward,
  type ChallengeDifficulty,
  type DailyChallengeAssignment,
  type EconomyChallengeType,
} from "./economy.js";

/** The challenge day is always this zone's calendar day (CH-05). */
export const DAILY_CHALLENGE_TIMEZONE = "Europe/Riga";

/** Assignment mix fixed by the task: two normal + one hard. */
const NORMAL_ASSIGNMENT_COUNT = 2;
const HARD_ASSIGNMENT_COUNT = 1;

/** Assignments stored per day, as a definitely-three-element tuple. */
type DailyAssignmentTriple = readonly [
  DailyChallengeAssignment,
  DailyChallengeAssignment,
  DailyChallengeAssignment,
];

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/* ------------------------------------------------------------------ */
/* Europe/Riga calendar math.                                          */
/* ------------------------------------------------------------------ */

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Wall-clock reading of an instant in Riga. hourCycle h23 is load-bearing:
 * the default en-US format can report hour 24 for midnight.
 */
const ZONED_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: DAILY_CHALLENGE_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zonedParts(instantMs: number): ZonedParts {
  const parts = ZONED_PARTS.formatToParts(new Date(instantMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : NaN;
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * UTC offset of Riga at an instant, in milliseconds (+2h winter, +3h summer).
 * Comparing the zone's wall clock against the same instant read as UTC is the
 * standard Intl way to get it without a timezone library.
 */
function offsetAt(instantMs: number): number {
  const parts = zonedParts(instantMs);
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wallClock - Math.floor(instantMs / 1000) * 1000;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatUtcDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Strict 'YYYY-MM-DD' parse; rejects malformed and impossible dates. */
function parseDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid dateKey: ${dateKey}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Invalid dateKey: ${dateKey}`);
  }
  return {year, month, day};
}

/** True when `value` is a well-formed 'YYYY-MM-DD' calendar date. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return false;
  try {
    parseDateKey(value);
    return true;
  } catch {
    return false;
  }
}

/** The Riga calendar day an instant belongs to, as 'YYYY-MM-DD'. */
export function rigaDateKey(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new Error("rigaDateKey received an invalid Date");
  }
  const parts = zonedParts(instant.getTime());
  return formatUtcDateKey(parts.year, parts.month, parts.day);
}

/** 'YYYY-MM-DD' shifted by whole days (calendar arithmetic, no DST involved). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const {year, month, day} = parseDateKey(dateKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatUtcDateKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/**
 * UTC instant of local midnight for a dateKey. Two offset probes converge:
 * the first guess reads the offset at the wrong instant, the second corrects
 * it. Riga's DST switches happen at 01:00 UTC (03:00/04:00 local), never at
 * midnight, so local midnight always exists exactly once.
 */
function localMidnightUtc(dateKey: string): Date {
  const {year, month, day} = parseDateKey(dateKey);
  const wallClock = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let instant = wallClock - offsetAt(wallClock);
  const refined = wallClock - offsetAt(instant);
  if (refined !== instant) instant = refined;
  return new Date(instant);
}

export interface DailyChallengeBounds {
  startsAt: Date;
  expiresAt: Date;
}

/**
 * [startsAt, expiresAt) for a Riga calendar day. The length is 23, 24 or 25
 * hours depending on the daylight-saving transition inside it; expiresAt is
 * exactly the next day's startsAt, so consecutive days never overlap or gap.
 */
export function rigaDayBounds(dateKey: string): DailyChallengeBounds {
  return {
    startsAt: localMidnightUtc(dateKey),
    expiresAt: localMidnightUtc(addDaysToDateKey(dateKey, 1)),
  };
}

/* ------------------------------------------------------------------ */
/* Assignment generation.                                              */
/* ------------------------------------------------------------------ */

/** Human-readable snapshot kept in the document (UI can localize from type). */
const TITLE_BUILDERS: Record<
  EconomyChallengeType,
  (targetValue: number) => string
> = {
  total_jumps: (targetValue) => `Jump ${targetValue} times`,
  games_played: (targetValue) => `Play ${targetValue} games`,
  single_game_score: (targetValue) => `Score ${targetValue} in one game`,
  total_score: (targetValue) => `Score ${targetValue} total`,
};

export function dailyChallengeTitle(
  type: EconomyChallengeType,
  targetValue: number,
): string {
  return TITLE_BUILDERS[type](targetValue);
}

/** Uniform integer in [0, length): never length itself, never NaN. */
function pickIndex(length: number, random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(Math.max(value, 0), 1 - Number.EPSILON);
  return Math.floor(clamped * length);
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = pickIndex(i + 1, random);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * The one daily assignment generator. `random` is injectable so tests can pin
 * the selection; production uses Math.random (each user gets an independent
 * set, global uniqueness is deliberately NOT attempted).
 *
 * The id embeds the dateKey: challengeClaims/{challengeId} is keyed by the id
 * alone, so a target that repeats on another day must still be claimable.
 */
export function generateDailyAssignments(
  dateKey: string,
  random: () => number = Math.random,
): DailyAssignmentTriple {
  parseDateKey(dateKey);
  const [typeA, typeB, typeC] = shuffle(CHALLENGE_TYPES, random);
  if (!typeA || !typeB || !typeC) {
    // Unreachable with the four pinned types; a loud failure beats a
    // half-empty daily set if the catalog is ever edited down.
    throw new Error("Not enough challenge types to build a daily set");
  }

  const types = [typeA, typeB, typeC];
  const hardSlot = pickIndex(types.length, random);

  const build = (
    type: EconomyChallengeType,
    index: number,
  ): DailyChallengeAssignment => {
    const difficulty: ChallengeDifficulty =
      index === hardSlot ? "hard" : "normal";
    const tiers = CHALLENGE_TIERS[type][difficulty];
    const tier = tiers[pickIndex(tiers.length, random)];
    return {
      id: `${dateKey}-${type}-${tier.targetValue}`,
      type,
      difficulty,
      targetValue: tier.targetValue,
      rewardCoins: tier.rewardCoins,
      title: dailyChallengeTitle(type, tier.targetValue),
      claimedAt: null,
    };
  };

  // The mix is verified here, not assumed: a broken generator must never
  // persist a daily set that pays the wrong number of coins.
  const assignments = [build(typeA, 0), build(typeB, 1), build(typeC, 2)];
  const normal = assignments.filter((a) => a.difficulty === "normal").length;
  const hard = assignments.filter((a) => a.difficulty === "hard").length;
  if (
    assignments.length !== DAILY_CHALLENGE_COUNT ||
    normal !== NORMAL_ASSIGNMENT_COUNT ||
    hard !== HARD_ASSIGNMENT_COUNT
  ) {
    throw new Error("Daily assignment mix must be 2 normal + 1 hard");
  }
  for (const assignment of assignments) {
    if (
      lookupTierReward(
        assignment.type,
        assignment.difficulty,
        assignment.targetValue,
      ) !== assignment.rewardCoins
    ) {
      throw new Error("Daily assignment is outside the configured tiers");
    }
  }
  return [assignments[0], assignments[1], assignments[2]];
}

/* ------------------------------------------------------------------ */
/* Stored document shape.                                              */
/* ------------------------------------------------------------------ */

/** Firestore returns Timestamps; tests and seeds use Dates (toDate duck type). */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as {toDate?: unknown}).toDate === "function"
  ) {
    const converted = (value as {toDate: () => unknown}).toDate();
    if (converted instanceof Date && !Number.isNaN(converted.getTime())) {
      return converted;
    }
    return null;
  }
  return null;
}

function isAssignmentSnapshot(
  value: unknown,
): value is DailyChallengeAssignment {
  if (value === null || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  if (typeof a.id !== "string" || a.id.length === 0) return false;
  if (!CHALLENGE_TYPES.includes(a.type as EconomyChallengeType)) return false;
  if (!CHALLENGE_DIFFICULTIES.includes(a.difficulty as ChallengeDifficulty)) {
    return false;
  }
  if (
    typeof a.targetValue !== "number" ||
    !Number.isInteger(a.targetValue) ||
    a.targetValue <= 0
  ) {
    return false;
  }
  if (typeof a.rewardCoins !== "number" || !Number.isFinite(a.rewardCoins)) {
    return false;
  }
  if (typeof a.title !== "string") return false;
  return a.claimedAt === null || toDate(a.claimedAt) !== null;
}

function isAssignmentTriple(value: unknown): value is DailyAssignmentTriple {
  if (!Array.isArray(value) || value.length !== DAILY_CHALLENGE_COUNT) {
    return false;
  }
  return value.every(isAssignmentSnapshot);
}

/* ------------------------------------------------------------------ */
/* Reading / creating today's document.                                */
/* ------------------------------------------------------------------ */

export interface EnsuredDailyChallenge {
  dateKey: string;
  timezone: string;
  startsAt: Date;
  expiresAt: Date;
  assignedAt: Date;
  assignments: DailyAssignmentTriple;
  /** True only when this call created the document. */
  created: boolean;
}

/**
 * The stored daily set for `uid`'s Riga day, created on first request.
 *
 * Always called inside a transaction: concurrent first calls re-read on
 * conflict and the losers return the winner's stored set instead of writing
 * their own (no reroll on refresh, multiple tabs, or logout/login).
 *
 * A document whose shape is broken (missed assignments, unreadable dates,
 * wrong path key) is regenerated once — a corrupt row must not brick the
 * screen, and a fresh set is more defensible than partial data.
 */
export async function ensureDailyChallenge(
  db: Firestore,
  uid: string,
  now: Date,
  random: () => number = Math.random,
): Promise<EnsuredDailyChallenge> {
  const dateKey = rigaDateKey(now);
  const {startsAt, expiresAt} = rigaDayBounds(dateKey);
  const ref = db
    .collection(`users/${uid}/dailyChallenges`)
    .doc(dateKey);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const stored = snap.data() ?? {};
      const storedStarts = toDate(stored.startsAt);
      const storedExpires = toDate(stored.expiresAt);
      const storedAssigned = toDate(stored.assignedAt);
      if (
        stored.dateKey === dateKey &&
        storedStarts !== null &&
        storedExpires !== null &&
        storedAssigned !== null &&
        isAssignmentTriple(stored.assignments)
      ) {
        return {
          dateKey,
          timezone:
            typeof stored.timezone === "string"
              ? stored.timezone
              : DAILY_CHALLENGE_TIMEZONE,
          startsAt: storedStarts,
          expiresAt: storedExpires,
          assignedAt: storedAssigned,
          assignments: stored.assignments,
          created: false,
        };
      }
    }

    const assignments = generateDailyAssignments(dateKey, random);
    tx.set(ref, {
      dateKey,
      timezone: DAILY_CHALLENGE_TIMEZONE,
      startsAt,
      expiresAt,
      assignedAt: now,
      assignments,
    });
    return {
      dateKey,
      timezone: DAILY_CHALLENGE_TIMEZONE,
      startsAt,
      expiresAt,
      assignedAt: now,
      assignments,
      created: true,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Progress calculation.                                               */
/* ------------------------------------------------------------------ */

/** The only fields progress needs from an accepted gameResults row. */
export interface AcceptedGameResult {
  score: number;
  jumpCount: number;
}

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * Accepted runs for ONE player inside [startsAt, expiresAt).
 *
 * `uid` is the authenticated caller's uid — the same field submitGameResult
 * writes — so the query is scoped to this player's rows, never a scan of
 * everyone's history. No limit is applied: a limit would silently undercount
 * `total_jumps`/`games_played` on a busy day.
 *
 * Requires the composite index gameResults(uid ASC, createdAt ASC) declared
 * in firestore.indexes.json.
 */
export async function readDailyGameResults(
  db: Firestore,
  uid: string,
  bounds: DailyChallengeBounds,
): Promise<AcceptedGameResult[]> {
  const snap = await db
    .collection("gameResults")
    .where("uid", "==", uid)
    .where("createdAt", ">=", bounds.startsAt)
    .where("createdAt", "<", bounds.expiresAt)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() ?? {};
    return {score: safeCount(data.score), jumpCount: safeCount(data.jumpCount)};
  });
}

/**
 * Progress for one challenge type over the day's accepted runs:
 *   total_jumps       sum of jumpCount
 *   games_played      number of accepted completed games
 *   single_game_score best single score
 *   total_score       sum of score
 */
export function computeChallengeProgress(
  type: EconomyChallengeType,
  results: readonly AcceptedGameResult[],
): number {
  switch (type) {
  case "total_jumps":
    return results.reduce((sum, result) => sum + safeCount(result.jumpCount), 0);
  case "games_played":
    return results.length;
  case "single_game_score":
    return results.reduce(
      (best, result) => Math.max(best, safeCount(result.score)),
      0,
    );
  case "total_score":
    return results.reduce((sum, result) => sum + safeCount(result.score), 0);
  }
}

/** Progress capped at the target (a finished row reads 40/40, never 97/40). */
export function cappedProgress(progress: number, targetValue: number): number {
  return Math.min(progress, targetValue);
}
