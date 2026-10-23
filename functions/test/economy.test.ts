/**
 * ECON-01 — the one explicit challenge economy configuration.
 *
 * Pins the spec straight from the task:
 *   - the full type/difficulty/target → reward table and every allowed
 *     triple's payout,
 *   - every rejected type/difficulty/target combination,
 *   - the EXPLICIT free cosmetic IDs (7 skins, 3 backgrounds — never derived
 *     from an array index at runtime) and the 500/1000 coin prices,
 *   - the two original challenge types stay supported (older documents must
 *     not break).
 *
 * The client copy in birdenergy/src/features/economy.ts is cross-checked
 * against this file by birdenergy/src/features/economy.test.ts.
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  BACKGROUND_IDS,
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_TIERS,
  CHALLENGE_TYPES,
  DAILY_CHALLENGE_COUNT,
  DEFAULT_BACKGROUND_INDEX,
  DEFAULT_SKIN_INDEX,
  ECONOMY_VERSION,
  FREE_BACKGROUND_IDS,
  FREE_SKIN_IDS,
  PAID_BACKGROUND_PRICE,
  PAID_SKIN_PRICE,
  SKIN_IDS,
  lookupTierReward,
} from "../src/economy.js";

/** The specified table, written out independently of the config itself. */
const SPEC_TIERS = {
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
} as const;

describe("challenge economy — allowed targets and rewards", () => {
  it("matches the specified tier table exactly", () => {
    assert.deepEqual(CHALLENGE_TIERS, SPEC_TIERS);
  });

  it("supports exactly the four specified challenge types", () => {
    assert.deepEqual(CHALLENGE_TYPES, [
      "total_jumps",
      "games_played",
      "single_game_score",
      "total_score",
    ]);
    assert.deepEqual(CHALLENGE_DIFFICULTIES, ["normal", "hard"]);
  });

  it("keeps the two original challenge types supported (ECON-01 scope note)", () => {
    assert.ok(CHALLENGE_TYPES.includes("single_game_score"));
    assert.ok(CHALLENGE_TYPES.includes("games_played"));
    assert.equal(lookupTierReward("single_game_score", "normal", 20), 30);
    assert.equal(lookupTierReward("games_played", "hard", 20), 130);
  });

  it("pays the configured reward for every allowed triple", () => {
    for (const type of CHALLENGE_TYPES) {
      for (const difficulty of CHALLENGE_DIFFICULTIES) {
        for (const tier of CHALLENGE_TIERS[type][difficulty]) {
          assert.equal(
            lookupTierReward(type, difficulty, tier.targetValue),
            tier.rewardCoins,
            `${type}/${difficulty}/${tier.targetValue}`,
          );
        }
      }
    }
  });

  it("pins the economy constants", () => {
    assert.equal(ECONOMY_VERSION, 1);
    assert.equal(DAILY_CHALLENGE_COUNT, 3);
    assert.equal(PAID_SKIN_PRICE, 500);
    assert.equal(PAID_BACKGROUND_PRICE, 1000);
  });
});

describe("challenge economy — invalid type/difficulty/target combinations", () => {
  it("rejects an unknown or mistyped challenge type", () => {
    assert.equal(lookupTierReward("streak", "normal", 20), null);
    assert.equal(lookupTierReward("total_jumps ", "normal", 20), null);
    assert.equal(lookupTierReward("Total_Jumps", "normal", 20), null);
    assert.equal(lookupTierReward(42, "normal", 20), null);
    assert.equal(lookupTierReward(undefined, "normal", 20), null);
    assert.equal(lookupTierReward(null, "normal", 20), null);
  });

  it("rejects an unknown difficulty ('easy' is a LABEL, never the stored value)", () => {
    assert.equal(lookupTierReward("total_jumps", "easy", 20), null);
    assert.equal(lookupTierReward("total_jumps", "insane", 20), null);
    assert.equal(lookupTierReward("total_jumps", "Normal", 20), null);
    assert.equal(lookupTierReward("total_jumps", 1, 20), null);
    assert.equal(lookupTierReward("total_jumps", undefined, 20), null);
  });

  it("rejects targets that are not exact tiers of that triple", () => {
    // Not a target of total_jumps/normal (20/40/60) — even between tiers.
    assert.equal(lookupTierReward("total_jumps", "normal", 21), null);
    // A real target, but of another difficulty.
    assert.equal(lookupTierReward("total_jumps", "hard", 60), null);
    // A real target of another type.
    assert.equal(lookupTierReward("games_played", "normal", 20), null);
    // Edges just outside the tables.
    assert.equal(lookupTierReward("games_played", "normal", 4), null);
    assert.equal(lookupTierReward("games_played", "normal", 6), null);
    assert.equal(lookupTierReward("total_score", "hard", 501), null);
    assert.equal(lookupTierReward("single_game_score", "hard", 45), null);
  });

  it("rejects targets that are not exact numbers", () => {
    assert.equal(lookupTierReward("total_jumps", "normal", "20"), null);
    assert.equal(lookupTierReward("total_jumps", "normal", 20.5), null);
    assert.equal(lookupTierReward("total_jumps", "normal", -20), null);
    assert.equal(lookupTierReward("total_jumps", "normal", 0), null);
    assert.equal(lookupTierReward("total_jumps", "normal", NaN), null);
    assert.equal(lookupTierReward("total_jumps", "normal", undefined), null);
  });
});

describe("challenge economy — explicit free cosmetic IDs", () => {
  it("pins both catalogs in their existing order", () => {
    assert.deepEqual(SKIN_IDS, [
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
    ]);
    assert.deepEqual(BACKGROUND_IDS, [
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
    ]);
  });

  it("grants exactly 7 explicit free skins and 3 free backgrounds", () => {
    assert.deepEqual(FREE_SKIN_IDS, [
      "bird2-1",
      "bird2-2",
      "bird2-3",
      "bird2-4",
      "bird2-5",
      "bird2-6",
      "bird2-7",
    ]);
    assert.deepEqual(FREE_BACKGROUND_IDS, [
      "background1",
      "background2",
      "background3",
    ]);
    assert.equal(new Set(FREE_SKIN_IDS).size, 7);
    assert.equal(new Set(FREE_BACKGROUND_IDS).size, 3);
  });

  it("chooses the free IDs from the catalog order (free ∪ paid = catalog)", () => {
    for (const id of FREE_SKIN_IDS) {
      assert.ok((SKIN_IDS as readonly string[]).includes(id), `${id} must be a catalog skin`);
    }
    for (const id of FREE_BACKGROUND_IDS) {
      assert.ok(
        (BACKGROUND_IDS as readonly string[]).includes(id),
        `${id} must be a catalog sky`,
      );
    }
    const paidSkins = SKIN_IDS.filter((id) => !FREE_SKIN_IDS.includes(id));
    const paidBackgrounds = BACKGROUND_IDS.filter(
      (id) => !FREE_BACKGROUND_IDS.includes(id),
    );
    assert.equal(paidSkins.length, SKIN_IDS.length - FREE_SKIN_IDS.length);
    assert.equal(
      paidBackgrounds.length,
      BACKGROUND_IDS.length - FREE_BACKGROUND_IDS.length,
    );
    assert.equal(new Set([...FREE_SKIN_IDS, ...paidSkins]).size, SKIN_IDS.length);
    assert.equal(
      new Set([...FREE_BACKGROUND_IDS, ...paidBackgrounds]).size,
      BACKGROUND_IDS.length,
    );
  });

  it("defaults the equipped fallback to a free entry of each catalog", () => {
    assert.equal(DEFAULT_SKIN_INDEX, 0);
    assert.equal(DEFAULT_BACKGROUND_INDEX, 0);
    assert.ok(FREE_SKIN_IDS.includes(SKIN_IDS[DEFAULT_SKIN_INDEX]));
    assert.ok(
      FREE_BACKGROUND_IDS.includes(BACKGROUND_IDS[DEFAULT_BACKGROUND_INDEX]),
    );
  });
});
