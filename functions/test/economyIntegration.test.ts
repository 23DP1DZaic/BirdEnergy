/**
 * CH-06 — cross-feature integration of the complete economy loop.
 *
 * These tests go through the REAL callables (wrapped with
 * firebase-functions-test) against the in-memory Admin SDK fake, so a single
 * scenario touches sign-in initialization, score saving, daily assignment,
 * progress calculation, claiming and cosmetic purchases exactly as the app
 * does. They exist to catch cross-feature regressions the per-feature suites
 * cannot see:
 *
 *   new / existing user initialization → submitGameResult → daily progress →
 *   claim once → purchase a skin (500) / background (1000) → reload (another
 *   sign-in backfill) → the balance, ownership and today's assignments are
 *   unchanged.
 *
 * Also pinned here: the next Europe/Riga day gets a fresh set while yesterday
 * stays history, a duplicate submission never double-counts progress, and the
 * pre-existing admin CRUD, leaderboard and score-saving paths still work.
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  acceptDataProcessing,
  adminChallengeMutation,
  claimChallengeReward,
  getDailyChallenges,
  getLeaderboard,
  purchaseCosmetic,
  submitGameResult,
} from "../src/index.js";
import {
  ECONOMY_VERSION,
  FREE_BACKGROUND_IDS,
  FREE_SKIN_IDS,
  PAID_BACKGROUND_PRICE,
  PAID_SKIN_PRICE,
  type ChallengeDifficulty,
  type DailyChallengeAssignment,
  type EconomyChallengeType,
} from "../src/economy.js";
import {
  addDaysToDateKey,
  rigaDateKey,
  rigaDayBounds,
} from "../src/dailyChallenges.js";
import { initializeEconomy } from "../src/economyInit.js";
import {
  ADMIN_AUTH,
  USER_AUTH,
  errorCode,
  wrapCallable,
} from "./helpers/callables.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";

const consent = wrapCallable<{ ok: boolean }>(acceptDataProcessing);
const submit = wrapCallable<{
  bestScore: number;
  totalGames: number;
  totalScore: number;
  newBest: boolean;
  coinsEarned: number;
  coins: number;
}>(submitGameResult);
const fetchDaily = wrapCallable<{
  dateKey: string;
  expiresAt: string;
  assignments: Array<{
    id: string;
    type: EconomyChallengeType;
    difficulty: ChallengeDifficulty;
    targetValue: number;
    rewardCoins: number;
    claimedAt: string | null;
    progress: number;
    completed: boolean;
  }>;
}>(getDailyChallenges);
const claim = wrapCallable<{
  ok: true;
  rewardCoins: number;
  coins: number;
  alreadyClaimed: boolean;
}>(claimChallengeReward);
const buy = wrapCallable<{
  price: number;
  alreadyOwned: boolean;
  coins: number;
  ownedSkinIds: string[];
  ownedBackgroundIds: string[];
}>(purchaseCosmetic);
const mutate = wrapCallable<{ ok: boolean; challengeId: string }>(
  adminChallengeMutation,
);
const leaderboard = wrapCallable<{ entries: Array<{ name: string; score: number }> }>(
  getLeaderboard,
);

const OTHER_AUTH = {
  uid: "tg-222222222",
  token: { role: "user", telegramId: 222222222 },
};

const PAID_SKIN = "kirkbird";
const PAID_BACKGROUND = "background4";
const TZ = "Europe/Riga";

let db: ReturnType<typeof installFakeFirestore>;

beforeEach(() => {
  db = installFakeFirestore();
});

const dailyCol = (uid: string) => `users/${uid}/dailyChallenges`;

function firestore(): Firestore {
  return db as unknown as Firestore;
}

function profileData(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    uid,
    telegramId: 111111111,
    inGameName: "Player One",
    username: "playerone",
    role: "user",
    coins: 0,
    bestScore: 0,
    totalGames: 0,
    totalScore: 0,
    acceptedDataProcessingAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function seedProfile(uid: string, overrides: Record<string, unknown> = {}) {
  db.seed("users", uid, profileData(uid, overrides));
}

function peekProfile(uid: string) {
  return db.peek("users", uid) ?? {};
}

/** Server-shaped assignment (ids embed the dateKey, as the generator does). */
function assignment(
  dateKey: string,
  type: EconomyChallengeType,
  difficulty: ChallengeDifficulty,
  targetValue: number,
  rewardCoins: number,
): DailyChallengeAssignment {
  return {
    id: `${dateKey}-${type}-${targetValue}`,
    type,
    difficulty,
    targetValue,
    rewardCoins,
    title: `${type} ${targetValue}`,
    claimedAt: null,
  };
}

/** Store a complete daily document for one Riga day under `uid`. */
function seedDaily(
  uid: string,
  dateKey: string,
  assignments: DailyChallengeAssignment[],
): void {
  const { startsAt, expiresAt } = rigaDayBounds(dateKey);
  db.seed(dailyCol(uid), dateKey, {
    dateKey,
    timezone: TZ,
    startsAt,
    expiresAt,
    assignedAt: startsAt,
    assignments,
  });
}

/** Seed an accepted run at an exact instant (what submitGameResult stores). */
function seedRun(
  uid: string,
  id: string,
  score: number,
  jumpCount: number,
  createdAt: Date,
): void {
  db.seed("gameResults", id, {
    uid,
    score,
    durationMs: 30_000,
    jumpCount,
    createdAt,
  });
}

describe("user initialization", () => {
  it("gives a brand-new account 0 coins and the explicit free grants", async () => {
    await consent({ data: {}, auth: USER_AUTH });

    const profile = peekProfile(USER_AUTH.uid);
    assert.equal(profile.coins, 0);
    assert.deepEqual(profile.ownedSkinIds, [...FREE_SKIN_IDS]);
    assert.deepEqual(profile.ownedBackgroundIds, [...FREE_BACKGROUND_IDS]);
    assert.equal(profile.economyVersion, ECONOMY_VERSION);
  });

  it("preserves an existing balance, ownership and valid equipped look", async () => {
    seedProfile(USER_AUTH.uid, {
      coins: 640,
      ownedSkinIds: [...FREE_SKIN_IDS, PAID_SKIN],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
      // 7 = kirkbird (owned); 9 = background10 (paid, NOT owned).
      preferredBird: 7,
      preferredBackground: 9,
      economyVersion: ECONOMY_VERSION,
    });

    await consent({ data: {}, auth: USER_AUTH });

    const profile = peekProfile(USER_AUTH.uid);
    assert.equal(profile.coins, 640);
    assert.deepEqual(profile.ownedSkinIds, [...FREE_SKIN_IDS, PAID_SKIN]);
    assert.equal(profile.preferredBird, 7);
    assert.equal(profile.preferredBackground, 0, "locked look resets to free default");
  });

  it("is idempotent across repeated sign-ins", async () => {
    await consent({ data: {}, auth: USER_AUTH });
    const first = peekProfile(USER_AUTH.uid);

    await consent({ data: {}, auth: USER_AUTH });
    await initializeEconomy(firestore(), USER_AUTH.uid);
    await initializeEconomy(firestore(), USER_AUTH.uid);

    // acceptedDataProcessingAt is refreshed on consent by design — the
    // economy slice must be untouched.
    const again = peekProfile(USER_AUTH.uid);
    for (const field of [
      "coins",
      "ownedSkinIds",
      "ownedBackgroundIds",
      "preferredBird",
      "preferredBackground",
      "economyVersion",
    ]) {
      assert.deepEqual(again[field], first[field], field);
    }
  });
});

describe("score saving feeds challenge progress", () => {
  it("one accepted game updates every relevant challenge type", async () => {
    seedProfile(USER_AUTH.uid);
    await fetchDaily({ data: undefined, auth: USER_AUTH }); // server assigns today's 3 types

    await submit({
      data: { score: 25, durationMs: 30_000, jumpCount: 7, runId: "run-1" },
      auth: USER_AUTH,
    });
    const today = (await fetchDaily({ data: undefined, auth: USER_AUTH })).assignments;

    const expected: Record<EconomyChallengeType, number> = {
      total_jumps: 7,
      games_played: 1,
      single_game_score: 25,
      total_score: 25,
    };
    for (const item of today) {
      const raw = expected[item.type];
      assert.equal(
        item.progress,
        Math.min(raw, item.targetValue),
        `${item.type} progress`,
      );
      assert.equal(item.completed, raw >= item.targetValue);
    }
  });

  it("a retried submission does not count progress twice", async () => {
    seedProfile(USER_AUTH.uid);
    await fetchDaily({ data: undefined, auth: USER_AUTH });

    const run = {
      score: 10,
      durationMs: 20_000,
      jumpCount: 5,
      runId: "retry-me",
    };
    await submit({ data: run, auth: USER_AUTH });
    const once = (await fetchDaily({ data: undefined, auth: USER_AUTH })).assignments;
    await submit({ data: run, auth: USER_AUTH });
    const twice = (await fetchDaily({ data: undefined, auth: USER_AUTH })).assignments;

    assert.deepEqual(
      twice.map((item) => item.progress),
      once.map((item) => item.progress),
    );
    assert.equal(peekProfile(USER_AUTH.uid).totalGames, 1);
  });

  it("counts accepted runs finished earlier the same day", async () => {
    seedProfile(USER_AUTH.uid);
    const dateKey = rigaDateKey(new Date());
    const { startsAt } = rigaDayBounds(dateKey);
    seedDaily(USER_AUTH.uid, dateKey, [
      assignment(dateKey, "total_jumps", "normal", 20, 20),
      assignment(dateKey, "games_played", "normal", 5, 30),
      assignment(dateKey, "total_score", "hard", 300, 90),
    ]);
    seedRun(USER_AUTH.uid, "earlier", 5, 12, new Date(startsAt.getTime() + 60_000));
    seedRun(USER_AUTH.uid, "now", 6, 9, new Date());

    const daily = await fetchDaily({ data: undefined, auth: USER_AUTH });
    const byType = new Map(daily.assignments.map((item) => [item.type, item]));
    // The server caps the reported progress at the target.
    assert.equal(byType.get("total_jumps")?.progress, 20);
    assert.equal(byType.get("total_jumps")?.completed, true);
    assert.equal(byType.get("games_played")?.progress, 2);
    assert.equal(byType.get("total_score")?.progress, 11);
  });
});

describe("claiming and purchasing", () => {
  it("claims a completed daily challenge exactly once", async () => {
    seedProfile(USER_AUTH.uid);
    const dateKey = rigaDateKey(new Date());
    seedDaily(USER_AUTH.uid, dateKey, [
      assignment(dateKey, "total_jumps", "normal", 20, 20),
      assignment(dateKey, "games_played", "normal", 5, 30),
      assignment(dateKey, "total_score", "hard", 300, 90),
    ]);
    const { startsAt } = rigaDayBounds(dateKey);
    seedRun(USER_AUTH.uid, "r1", 4, 12, new Date(startsAt.getTime() + 60_000));
    seedRun(USER_AUTH.uid, "r2", 5, 9, new Date(startsAt.getTime() + 120_000));
    const challengeId = `${dateKey}-total_jumps-20`;

    const first = await claim({
      data: { source: "daily", challengeId },
      auth: USER_AUTH,
    });
    assert.equal(first.alreadyClaimed, false);
    assert.equal(first.rewardCoins, 20);
    assert.equal(first.coins, 20);
    assert.equal(peekProfile(USER_AUTH.uid).coins, 20);

    const repeat = await claim({
      data: { source: "daily", challengeId },
      auth: USER_AUTH,
    });
    assert.equal(repeat.alreadyClaimed, true);
    assert.equal(repeat.coins, 20);

    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () =>
        claim({ data: { source: "daily", challengeId }, auth: USER_AUTH }),
      ),
    );
    assert.ok(concurrent.every((result) => result.alreadyClaimed));
    assert.equal(peekProfile(USER_AUTH.uid).coins, 20);
  });

  it("buys a skin for 500 and a background for 1000, free items never charge", async () => {
    seedProfile(USER_AUTH.uid, { coins: PAID_SKIN_PRICE });

    const skin = await buy({
      data: { kind: "skin", itemId: PAID_SKIN },
      auth: USER_AUTH,
    });
    assert.equal(skin.price, 500);
    assert.equal(skin.coins, 0);
    assert.ok(skin.ownedSkinIds.includes(PAID_SKIN));

    db.write("users", USER_AUTH.uid, {
      ...peekProfile(USER_AUTH.uid),
      coins: PAID_BACKGROUND_PRICE,
    });
    const background = await buy({
      data: { kind: "background", itemId: PAID_BACKGROUND },
      auth: USER_AUTH,
    });
    assert.equal(background.price, 1000);
    assert.equal(background.coins, 0);
    assert.ok(background.ownedBackgroundIds.includes(PAID_BACKGROUND));

    const free = await buy({
      data: { kind: "skin", itemId: FREE_SKIN_IDS[0] },
      auth: USER_AUTH,
    });
    assert.equal(free.price, 0);
    assert.equal(free.alreadyOwned, true);
    assert.equal(free.coins, 0);
  });

  it("stacks gameplay coins on challenge rewards and pays for cosmetics", async () => {
    seedProfile(USER_AUTH.uid, { coins: 495 });
    const dateKey = rigaDateKey(new Date());
    seedDaily(USER_AUTH.uid, dateKey, [
      assignment(dateKey, "total_jumps", "normal", 20, 20),
      assignment(dateKey, "games_played", "normal", 5, 30),
      assignment(dateKey, "total_score", "hard", 300, 90),
    ]);

    // ECON-03: a 25-point run pays 5 coins and completes the 20-jump tier.
    const run = await submit({
      data: { score: 25, durationMs: 30_000, jumpCount: 25, runId: "econ-03" },
      auth: USER_AUTH,
    });
    assert.equal(run.coinsEarned, 5);
    assert.equal(run.coins, 500);
    assert.equal(peekProfile(USER_AUTH.uid).coins, 500);

    const claimed = await claim({
      data: { source: "daily", challengeId: `${dateKey}-total_jumps-20` },
      auth: USER_AUTH,
    });
    assert.equal(claimed.coins, 520, "challenge reward added on top");

    const purchase = await buy({
      data: { kind: "skin", itemId: PAID_SKIN },
      auth: USER_AUTH,
    });
    assert.equal(purchase.price, PAID_SKIN_PRICE);
    assert.equal(purchase.coins, 20);
    assert.equal(purchase.ownedSkinIds.includes(PAID_SKIN), true);
    assert.equal(peekProfile(USER_AUTH.uid).coins, 20);
  });

  it("keeps coins and ownership through a reload/sign-in backfill", async () => {
    seedProfile(USER_AUTH.uid, { coins: PAID_SKIN_PRICE + PAID_BACKGROUND_PRICE });
    await buy({ data: { kind: "skin", itemId: PAID_SKIN }, auth: USER_AUTH });
    await buy({
      data: { kind: "background", itemId: PAID_BACKGROUND },
      auth: USER_AUTH,
    });

    // "Reload": the sign-in backfill runs again and must be a no-op.
    await initializeEconomy(firestore(), USER_AUTH.uid);
    await initializeEconomy(firestore(), USER_AUTH.uid);

    const profile = peekProfile(USER_AUTH.uid);
    assert.equal(profile.coins, 0);
    assert.deepEqual(profile.ownedSkinIds, [...FREE_SKIN_IDS, PAID_SKIN]);
    assert.deepEqual(profile.ownedBackgroundIds, [
      ...FREE_BACKGROUND_IDS,
      PAID_BACKGROUND,
    ]);

    const again = await buy({
      data: { kind: "skin", itemId: PAID_SKIN },
      auth: USER_AUTH,
    });
    assert.equal(again.alreadyOwned, true);
    assert.equal(again.coins, 0);
  });
});

describe("daily assignment persistence", () => {
  it("does not reroll today's set on reload or repeated calls", async () => {
    seedProfile(USER_AUTH.uid);

    const first = await fetchDaily({ data: undefined, auth: USER_AUTH });
    const second = await fetchDaily({ data: undefined, auth: USER_AUTH });
    await initializeEconomy(firestore(), USER_AUTH.uid);
    const third = await fetchDaily({ data: undefined, auth: USER_AUTH });

    assert.equal(first.assignments.length, 3);
    assert.deepEqual(
      second.assignments.map((item) => item.id),
      first.assignments.map((item) => item.id),
    );
    assert.deepEqual(
      third.assignments.map((item) => item.id),
      first.assignments.map((item) => item.id),
    );
    assert.equal(db.rows(dailyCol(USER_AUTH.uid)).length, 1);
  });

  it("creates the next Riga day's set and keeps yesterday as history", async () => {
    seedProfile(USER_AUTH.uid);
    const yesterdayKey = addDaysToDateKey(rigaDateKey(new Date()), -1);
    seedDaily(USER_AUTH.uid, yesterdayKey, [
      assignment(yesterdayKey, "total_jumps", "normal", 20, 20),
      assignment(yesterdayKey, "games_played", "normal", 5, 30),
      assignment(yesterdayKey, "total_score", "hard", 300, 90),
    ]);

    const today = await fetchDaily({ data: undefined, auth: USER_AUTH });
    assert.notEqual(today.dateKey, yesterdayKey);
    assert.ok(today.assignments.every((item) => item.id.startsWith(today.dateKey)));
    assert.ok(db.peek(dailyCol(USER_AUTH.uid), yesterdayKey), "yesterday is kept");

    // Yesterday's unclaimed reward is historical: the claim is rejected.
    assert.equal(
      await errorCode(
        claim({
          data: {
            source: "daily",
            challengeId: `${yesterdayKey}-total_jumps-20`,
          },
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
    );
    assert.equal(peekProfile(USER_AUTH.uid).coins, 0);
  });
});

describe("security boundary", () => {
  it("rejects unauthenticated claims and purchases", async () => {
    seedProfile(USER_AUTH.uid);
    assert.equal(
      await errorCode(
        claim({ data: { source: "daily", challengeId: "anything" } }),
      ),
      "unauthenticated",
    );
    assert.equal(
      await errorCode(buy({ data: { kind: "skin", itemId: PAID_SKIN } })),
      "unauthenticated",
    );
    assert.equal(peekProfile(USER_AUTH.uid).coins, 0);
  });

  it("rejects another player's daily assignment", async () => {
    seedProfile(USER_AUTH.uid);
    seedProfile(OTHER_AUTH.uid);
    await fetchDaily({ data: undefined, auth: USER_AUTH });
    const mine = (await fetchDaily({ data: undefined, auth: USER_AUTH })).assignments[0];
    assert.ok(mine);

    assert.equal(
      await errorCode(
        claim({ data: { source: "daily", challengeId: mine.id }, auth: OTHER_AUTH }),
      ),
      "not-found",
    );
  });
});

describe("pre-existing features still work", () => {
  it("keeps admin challenge CRUD working with derived rewards", async () => {
    const payload = {
      title: "Score 150 total",
      description: "Reach a total score of 150 points.",
      type: "total_score",
      difficulty: "normal",
      targetValue: 150,
      startDate: new Date("2026-10-01T00:00:00Z").toISOString(),
      endDate: new Date("2026-10-31T00:00:00Z").toISOString(),
    };
    const created = await mutate({
      data: { operation: "create", payload },
      auth: ADMIN_AUTH,
    });
    assert.equal(db.peek("challenges", created.challengeId)?.rewardCoins, 35);

    await mutate({
      data: {
        operation: "update",
        challengeId: created.challengeId,
        payload: { ...payload, targetValue: 200 },
      },
      auth: ADMIN_AUTH,
    });
    assert.equal(db.peek("challenges", created.challengeId)?.rewardCoins, 45);

    await mutate({
      data: { operation: "delete", challengeId: created.challengeId },
      auth: ADMIN_AUTH,
    });
    assert.equal(db.peek("challenges", created.challengeId), undefined);
  });

  it("keeps score saving and the leaderboard working", async () => {
    seedProfile(USER_AUTH.uid);

    const aggregates = await submit({
      data: { score: 42, durationMs: 40_000, jumpCount: 17, runId: "run-42" },
      auth: USER_AUTH,
    });
    assert.equal(aggregates.totalGames, 1);
    assert.equal(aggregates.totalScore, 42);
    assert.equal(aggregates.bestScore, 42);

    const profile = peekProfile(USER_AUTH.uid);
    assert.equal(profile.bestScore, 42);
    assert.equal(profile.totalGames, 1);
    assert.equal(profile.totalScore, 42);
    assert.equal(db.rows("gameResults").length, 1);

    const board = await leaderboard({
      data: { period: "all" },
      auth: USER_AUTH,
    });
    assert.deepEqual(board.entries[0], { name: "Player One", score: 42, photoUrl: null });
  });
});
