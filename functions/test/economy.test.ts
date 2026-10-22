/**
 * ECON-01 — challenge configuration, cosmetic catalog and the idempotent
 * user economy initializer.
 *
 * The reward table is the money side of the challenge feature: an assignment
 * may only use a (type, difficulty, targetValue) triple listed in
 * src/economy.ts, and the payout is that one configured reward. These tests
 * pin the exact table, prove unlisted combinations cannot pay out, pin the
 * explicit free cosmetic ids, and drive the initializer both directly and
 * through the consent callable that runs it on every profile upsert.
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { acceptDataProcessing } from "../src/index.js";
import {
  BACKGROUND_IDS,
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_REWARDS,
  CHALLENGE_TYPES,
  DAILY_CHALLENGE_COUNT,
  DEFAULT_BACKGROUND_INDEX,
  DEFAULT_SKIN_INDEX,
  ECONOMY_VERSION,
  FREE_BACKGROUND_IDS,
  FREE_SKIN_IDS,
  PAID_BACKGROUND_PRICE_COINS,
  PAID_SKIN_PRICE_COINS,
  SKIN_IDS,
  allowedChallengeRewards,
  backgroundPriceCoins,
  challengeReward,
  initialUserEconomy,
  isChallengeDifficulty,
  isChallengeType,
  isFreeBackground,
  isFreeSkin,
  planUserEconomy,
  skinPriceCoins,
  type UserEconomyPatch,
} from "../src/economy.js";
import { USER_AUTH, wrapCallable } from "./helpers/callables.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";

describe("ECON-01 — challenge configuration", () => {
  it("supports exactly the four documented challenge types", () => {
    assert.deepEqual([...CHALLENGE_TYPES], [
      "total_jumps",
      "games_played",
      "single_game_score",
      "total_score",
    ]);
    assert.deepEqual([...CHALLENGE_DIFFICULTIES], ["normal", "hard"]);
  });

  it("pins the full allowed target → reward table", () => {
    assert.deepEqual(CHALLENGE_REWARDS, {
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
    });
  });

  it("pays exactly the configured reward for every allowed target", () => {
    for (const type of CHALLENGE_TYPES) {
      for (const difficulty of CHALLENGE_DIFFICULTIES) {
        for (const entry of CHALLENGE_REWARDS[type][difficulty]) {
          assert.equal(
            challengeReward(type, difficulty, entry.targetValue),
            entry.rewardCoins,
            `${type}/${difficulty}/${entry.targetValue}`,
          );
        }
      }
    }
  });

  it("has no duplicate target inside one type + difficulty", () => {
    for (const type of CHALLENGE_TYPES) {
      for (const difficulty of CHALLENGE_DIFFICULTIES) {
        const targets = CHALLENGE_REWARDS[type][difficulty].map(
          (entry) => entry.targetValue,
        );
        assert.equal(new Set(targets).size, targets.length);
      }
    }
  });

  it("rejects an unknown type", () => {
    for (const type of ["streak", "", null, 42, undefined]) {
      assert.equal(challengeReward(type, "normal", 20), null);
      assert.equal(allowedChallengeRewards(type, "normal"), null);
    }
  });

  it("rejects an unknown or differently-cased difficulty", () => {
    // "Easy" is a DISPLAY label; the stored value is "normal".
    for (const difficulty of ["easy", "Easy", "Normal", "HARD", "", null]) {
      assert.equal(challengeReward("total_jumps", difficulty, 20), null);
      assert.equal(allowedChallengeRewards("total_jumps", difficulty), null);
    }
  });

  it("rejects a target that is not configured for that type + difficulty", () => {
    // 30 jumps is not a goal; 5 jumps even less so.
    assert.equal(challengeReward("total_jumps", "normal", 30), null);
    assert.equal(challengeReward("total_jumps", "normal", 5), null);
    // A hard goal is not payable on normal difficulty, and vice versa.
    assert.equal(challengeReward("total_jumps", "normal", 80), null);
    assert.equal(challengeReward("games_played", "hard", 5), null);
    assert.equal(challengeReward("total_score", "normal", 500), null);
    assert.equal(challengeReward("single_game_score", "hard", 20), null);
  });

  it("rejects a target that is not a whole number", () => {
    for (const target of [20.5, "20", null, undefined, NaN, Infinity, -20, 0]) {
      assert.equal(challengeReward("total_jumps", "normal", target), null);
    }
  });

  it("narrows types and difficulties only for the documented values", () => {
    assert.equal(isChallengeType("total_score"), true);
    assert.equal(isChallengeType("total_scores"), false);
    assert.equal(isChallengeDifficulty("normal"), true);
    assert.equal(isChallengeDifficulty("easy"), false);
  });

  it("assigns exactly three challenges per day", () => {
    assert.equal(DAILY_CHALLENGE_COUNT, 3);
  });
});

describe("ECON-01 — cosmetic configuration", () => {
  it("pins the 7 free skin ids explicitly", () => {
    assert.deepEqual([...FREE_SKIN_IDS], [
      "classic-1",
      "classic-2",
      "classic-3",
      "classic-4",
      "classic-5",
      "classic-6",
      "classic-7",
    ]);
  });

  it("pins the 3 free background ids explicitly", () => {
    assert.deepEqual([...FREE_BACKGROUND_IDS], ["sky-1", "sky-2", "sky-3"]);
  });

  it("selects the free ids from the existing catalog order", () => {
    assert.deepEqual([...FREE_SKIN_IDS], SKIN_IDS.slice(0, 7));
    assert.deepEqual([...FREE_BACKGROUND_IDS], BACKGROUND_IDS.slice(0, 3));
  });

  it("keeps the catalog order and unique ids", () => {
    assert.equal(SKIN_IDS.length, 10);
    assert.equal(BACKGROUND_IDS.length, 10);
    assert.equal(new Set(SKIN_IDS).size, SKIN_IDS.length);
    assert.equal(new Set(BACKGROUND_IDS).size, BACKGROUND_IDS.length);
  });

  it("marks only the listed ids as free", () => {
    for (const id of SKIN_IDS) {
      assert.equal(isFreeSkin(id), FREE_SKIN_IDS.includes(id), id);
    }
    for (const id of BACKGROUND_IDS) {
      assert.equal(
        isFreeBackground(id),
        FREE_BACKGROUND_IDS.includes(id),
        id,
      );
    }
    assert.equal(isFreeSkin("kirk"), false);
    assert.equal(isFreeSkin("litvin"), false);
    assert.equal(isFreeSkin("mell"), false);
    assert.equal(isFreeBackground("sky-4"), false);
    assert.equal(isFreeSkin("does-not-exist"), false);
  });

  it("prices paid skins at 500 and paid backgrounds at 1000", () => {
    assert.equal(PAID_SKIN_PRICE_COINS, 500);
    assert.equal(PAID_BACKGROUND_PRICE_COINS, 1000);

    assert.equal(skinPriceCoins("classic-1"), 0);
    assert.equal(skinPriceCoins("classic-7"), 0);
    assert.equal(skinPriceCoins("kirk"), 500);
    assert.equal(skinPriceCoins("mell"), 500);
    assert.equal(skinPriceCoins("nope"), null);

    assert.equal(backgroundPriceCoins("sky-1"), 0);
    assert.equal(backgroundPriceCoins("sky-3"), 0);
    assert.equal(backgroundPriceCoins("sky-4"), 1000);
    assert.equal(backgroundPriceCoins("sky-10"), 1000);
    assert.equal(backgroundPriceCoins("nope"), null);
  });

  it("uses a free cosmetic as each default", () => {
    assert.equal(isFreeSkin(SKIN_IDS[DEFAULT_SKIN_INDEX]), true);
    assert.equal(
      isFreeBackground(BACKGROUND_IDS[DEFAULT_BACKGROUND_INDEX]),
      true,
    );
  });
});

/** Applies a plan's patch the way tx.update() would. */
function applyPatch(
  existing: Record<string, unknown>,
  patch: UserEconomyPatch,
): Record<string, unknown> {
  return { ...existing, ...patch };
}

describe("ECON-01 — user economy initialization", () => {
  it("new profiles start with 0 coins, the free cosmetics and the version", () => {
    const economy = initialUserEconomy();
    assert.deepEqual(economy, {
      coins: 0,
      ownedSkinIds: [...FREE_SKIN_IDS],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
      economyVersion: ECONOMY_VERSION,
    });
  });

  it("initializes a profile that has no economy fields yet", () => {
    const { patch, economy } = planUserEconomy({
      bestScore: 12,
      totalGames: 3,
    });

    assert.deepEqual(patch, {
      coins: 0,
      ownedSkinIds: [...FREE_SKIN_IDS],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
      economyVersion: ECONOMY_VERSION,
    });
    assert.deepEqual(economy, initialUserEconomy());
  });

  it("treats a missing document the same as missing fields", () => {
    assert.deepEqual(planUserEconomy(undefined), planUserEconomy({}));
  });

  it("is idempotent: a second run produces an empty patch", () => {
    const first = planUserEconomy({});
    const initialized = applyPatch({}, first.patch);
    const second = planUserEconomy(initialized);

    assert.deepEqual(second.patch, {});
    assert.deepEqual(second.economy, first.economy);
    assert.deepEqual(initialUserEconomy(), first.economy);
  });

  it("preserves an established balance and paid ownership", () => {
    const { patch, economy } = planUserEconomy({
      coins: 1250,
      ownedSkinIds: ["classic-1", "kirk", "classic-3"],
      ownedBackgroundIds: ["sky-7"],
      economyVersion: ECONOMY_VERSION,
    });

    // Free ids are added (in catalog order), the paid ones are kept.
    assert.deepEqual(patch, {
      ownedSkinIds: [
        "classic-1",
        "classic-2",
        "classic-3",
        "classic-4",
        "classic-5",
        "classic-6",
        "classic-7",
        "kirk",
      ],
      ownedBackgroundIds: [
        "sky-1",
        "sky-2",
        "sky-3",
        "sky-7",
      ],
    });
    assert.equal(economy.coins, 1250);
    assert.equal(economy.economyVersion, ECONOMY_VERSION);
    // Neither the balance nor the version is rewritten.
    assert.deepEqual(Object.keys(patch).sort(), [
      "ownedBackgroundIds",
      "ownedSkinIds",
    ]);
  });

  it("does not touch an already initialized profile", () => {
    const initialized = {
      coins: 500,
      ownedSkinIds: ["classic-1", "classic-2", "classic-3", "classic-4",
        "classic-5", "classic-6", "classic-7", "litvin"],
      ownedBackgroundIds: ["sky-1", "sky-2", "sky-3", "sky-9"],
      economyVersion: ECONOMY_VERSION,
    };
    assert.deepEqual(planUserEconomy(initialized).patch, {});
  });

  it("normalizes a corrupt balance to 0 but keeps a legit one", () => {
    for (const coins of [-1, 1.5, "100", null, NaN, Infinity]) {
      const { patch, economy } = planUserEconomy({ coins });
      assert.equal(patch.coins, 0, `coins: ${String(coins)}`);
      assert.equal(economy.coins, 0);
    }
    assert.equal(planUserEconomy({ coins: 0 }).patch.coins, undefined);
  });

  it("drops ids outside the catalog instead of owning them", () => {
    const { patch, economy } = planUserEconomy({
      coins: 0,
      ownedSkinIds: ["ghost-skin", "classic-1", 7, null],
      ownedBackgroundIds: "sky-5",
      economyVersion: ECONOMY_VERSION,
    });

    assert.deepEqual(
      economy.ownedSkinIds,
      [...FREE_SKIN_IDS],
    );
    assert.deepEqual(economy.ownedBackgroundIds, [...FREE_BACKGROUND_IDS]);
    assert.deepEqual(patch.ownedSkinIds, [...FREE_SKIN_IDS]);
    assert.deepEqual(patch.ownedBackgroundIds, [...FREE_BACKGROUND_IDS]);
  });

  it("replaces a locked equipped skin with the free default", () => {
    // KirkBird is index 7 and paid: a legacy profile selected it for free.
    const { patch, economy } = planUserEconomy({
      coins: 0,
      ownedSkinIds: [...FREE_SKIN_IDS],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
      economyVersion: ECONOMY_VERSION,
      preferredBird: 7,
    });

    assert.equal(patch.preferredBird, DEFAULT_SKIN_INDEX);
    assert.equal(economy.coins, 0);
  });

  it("keeps an equipped cosmetic the player owns", () => {
    const { patch } = planUserEconomy({
      coins: 0,
      ownedSkinIds: [...FREE_SKIN_IDS, "kirk"],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS, "sky-7"],
      economyVersion: ECONOMY_VERSION,
      preferredBird: 7,
      preferredBackground: 6,
    });

    assert.deepEqual(patch, {});
  });

  it("replaces a locked equipped background with the free default", () => {
    const { patch } = planUserEconomy({
      coins: 0,
      ownedSkinIds: [...FREE_SKIN_IDS],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
      economyVersion: ECONOMY_VERSION,
      preferredBackground: 9,
    });

    assert.equal(patch.preferredBackground, DEFAULT_BACKGROUND_INDEX);
  });

  it("treats an out-of-range or corrupt equipped index as locked", () => {
    for (const preferredBird of [99, -1, 2.5, "3"]) {
      const { patch } = planUserEconomy({
        coins: 0,
        ownedSkinIds: [...FREE_SKIN_IDS],
        ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
        economyVersion: ECONOMY_VERSION,
        preferredBird,
      });
      assert.equal(
        patch.preferredBird,
        DEFAULT_SKIN_INDEX,
        `preferredBird: ${String(preferredBird)}`,
      );
    }
  });

  it("leaves an unset equipped cosmetic unset", () => {
    const { patch } = planUserEconomy({
      coins: 0,
      ownedSkinIds: [...FREE_SKIN_IDS],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
      economyVersion: ECONOMY_VERSION,
    });

    assert.deepEqual(patch, {});
  });

  it("preserves a newer economy version instead of downgrading it", () => {
    const { patch, economy } = planUserEconomy({
      coins: 10,
      ownedSkinIds: [...FREE_SKIN_IDS],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
      economyVersion: ECONOMY_VERSION + 1,
    });

    assert.equal(patch.economyVersion, undefined);
    assert.equal(economy.economyVersion, ECONOMY_VERSION + 1);
  });
});

describe("ECON-01 — initialization through the profile upsert", () => {
  const invoke = wrapCallable<{ ok: boolean }>(acceptDataProcessing);

  let db: ReturnType<typeof installFakeFirestore>;
  beforeEach(() => {
    db = installFakeFirestore();
  });

  it("creates a profile with 0 coins and the free cosmetics", async () => {
    await invoke({ data: {}, auth: USER_AUTH });
    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.coins, 0);
    assert.deepEqual(profile.ownedSkinIds, [...FREE_SKIN_IDS]);
    assert.deepEqual(profile.ownedBackgroundIds, [...FREE_BACKGROUND_IDS]);
    assert.equal(profile.economyVersion, ECONOMY_VERSION);
  });

  it("migrates an existing profile without losing its data", async () => {
    db.seed("users", USER_AUTH.uid, {
      bestScore: 42,
      totalGames: 7,
      totalScore: 180,
      preferredBird: 8, // LitvinBird — paid, not owned by a legacy profile
      preferredBackground: 5, // sky-6 — paid
    });

    await invoke({ data: {}, auth: USER_AUTH });

    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.bestScore, 42);
    assert.equal(profile.totalGames, 7);
    assert.equal(profile.totalScore, 180);
    assert.equal(profile.coins, 0);
    assert.deepEqual(profile.ownedSkinIds, [...FREE_SKIN_IDS]);
    assert.equal(profile.preferredBird, DEFAULT_SKIN_INDEX);
    assert.equal(profile.preferredBackground, DEFAULT_BACKGROUND_INDEX);
  });

  it("never overwrites an established balance or ownership on a later consent", async () => {
    const owned = [...FREE_SKIN_IDS, "mell"];
    db.seed("users", USER_AUTH.uid, {
      coins: 730,
      ownedSkinIds: owned,
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS, "sky-8"],
      economyVersion: ECONOMY_VERSION,
      preferredBird: 9,
      preferredBackground: 7,
      bestScore: 5,
      totalGames: 2,
      totalScore: 9,
    });

    await invoke({ data: {}, auth: USER_AUTH });
    const afterFirst = db.peek("users", USER_AUTH.uid);
    assert.ok(afterFirst);
    assert.equal(afterFirst.coins, 730);
    assert.deepEqual(afterFirst.ownedSkinIds, owned);
    assert.equal(afterFirst.preferredBird, 9);
    assert.equal(afterFirst.preferredBackground, 7);

    await invoke({ data: {}, auth: USER_AUTH });

    const afterSecond = db.peek("users", USER_AUTH.uid);
    assert.ok(afterSecond);
    assert.equal(afterSecond.coins, 730);
    assert.deepEqual(afterSecond.ownedSkinIds, owned);
    assert.deepEqual(
      afterSecond.ownedBackgroundIds,
      [...FREE_BACKGROUND_IDS, "sky-8"],
    );
    assert.equal(afterSecond.preferredBird, 9);
    assert.equal(afterSecond.preferredBackground, 7);
    assert.equal(afterSecond.economyVersion, ECONOMY_VERSION);
  });
});
