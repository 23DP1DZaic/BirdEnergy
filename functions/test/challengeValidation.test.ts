/**
 * ADM-01 / UI-04 — validation tests for the server-side rules that guard the
 * admin challenge form and the in-game name.
 *
 * These exercise the trust boundary directly: src/features/challengeValidation.ts
 * (the client copy) is only instant feedback, while validateChallengePayload()
 * and isValidInGameName() in src/index.ts are what actually accept or reject a
 * request. Valid input is accepted; every documented rule is broken in turn.
 *
 * CH-04 — since the economy extension the target is no longer any positive
 * number: type + difficulty + targetValue must be one exact ECON-01 tier
 * triple, and the returned rewardCoins is derived from CHALLENGE_TIERS (a
 * client-supplied rewardCoins never reaches this function's output).
 */
import "./setup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHALLENGE_DESCRIPTION_MAX,
  CHALLENGE_TITLE_MAX,
  CHALLENGE_TITLE_MIN,
  IN_GAME_NAME_MAX,
  IN_GAME_NAME_MIN,
  isValidInGameName,
  validateChallengePayload,
} from "../src/index.js";
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_TIERS,
  CHALLENGE_TYPES,
} from "../src/economy.js";

/** A payload that passes every rule, with per-test overrides. */
function validPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    title: "Weekend Sprint",
    description: "Score 40 points in a single run this weekend.",
    type: "single_game_score",
    difficulty: "normal",
    // single_game_score / normal / 40 → reward 60 in the ECON-01 table.
    targetValue: 40,
    startDate: "2026-10-10T00:00:00.000Z",
    endDate: "2026-10-12T23:59:59.999Z",
    ...overrides,
  };
}

/** Returns the HttpsError code thrown by validateChallengePayload, if any. */
function rejectionCode(payload: unknown): string | null {
  try {
    validateChallengePayload(payload);
    return null;
  } catch (err) {
    return (err as {code?: string}).code ?? "unknown";
  }
}

describe("validateChallengePayload — valid input", () => {
  it("accepts a well-formed payload and returns parsed values", () => {
    const result = validateChallengePayload(validPayload());
    assert.equal(result.title, "Weekend Sprint");
    assert.equal(
      result.description,
      "Score 40 points in a single run this weekend.",
    );
    assert.equal(result.type, "single_game_score");
    assert.equal(result.difficulty, "normal");
    assert.equal(result.targetValue, 40);
    // CH-04 — the reward comes from the tier table, not from the request.
    assert.equal(result.rewardCoins, 60);
    assert.equal(result.startDate.toISOString(), "2026-10-10T00:00:00.000Z");
    assert.equal(result.endDate.toISOString(), "2026-10-12T23:59:59.999Z");
  });

  it("trims surrounding whitespace from text fields", () => {
    const result = validateChallengePayload(
      validPayload({title: "  Sprint  ", description: "  Ten chars+  "}),
    );
    assert.equal(result.title, "Sprint");
    assert.equal(result.description, "Ten chars+");
  });

  it("accepts both original challenge types", () => {
    assert.equal(
      validateChallengePayload(
        validPayload({type: "games_played", targetValue: 10}),
      ).type,
      "games_played",
    );
  });

  it("accepts all four types at a tier of each difficulty (CH-04)", () => {
    for (const type of CHALLENGE_TYPES) {
      for (const difficulty of CHALLENGE_DIFFICULTIES) {
        const tier = CHALLENGE_TIERS[type][difficulty][0];
        const result = validateChallengePayload(
          validPayload({type, difficulty, targetValue: tier.targetValue}),
        );
        assert.equal(result.type, type);
        assert.equal(result.difficulty, difficulty);
        assert.equal(result.targetValue, tier.targetValue);
        assert.equal(result.rewardCoins, tier.rewardCoins, `${type}/${difficulty}`);
      }
    }
  });

  it("accepts the boundary values", () => {
    assert.equal(
      validateChallengePayload(validPayload({title: "abc"})).title,
      "abc",
    );
    assert.equal(
      validateChallengePayload(validPayload({title: "a".repeat(CHALLENGE_TITLE_MAX)})).title
        .length,
      CHALLENGE_TITLE_MAX,
    );
    assert.equal(
      validateChallengePayload(
        validPayload({description: "a".repeat(CHALLENGE_DESCRIPTION_MAX)}),
      ).description.length,
      CHALLENGE_DESCRIPTION_MAX,
    );
    // The lowest and highest tier targets in the whole table are accepted
    // (CH-04: numbers between tiers are NOT — see the invalid cases below).
    const lowest = CHALLENGE_TIERS.total_jumps.normal[0].targetValue;
    const hardestList = CHALLENGE_TIERS.total_score.hard;
    const highest = hardestList[hardestList.length - 1].targetValue;
    assert.equal(
      validateChallengePayload(
        validPayload({type: "total_jumps", difficulty: "normal", targetValue: lowest}),
      ).targetValue,
      lowest,
    );
    assert.equal(
      validateChallengePayload(
        validPayload({type: "total_score", difficulty: "hard", targetValue: highest}),
      ).targetValue,
      highest,
    );
  });

  it("accepts an end date equal to the start date", () => {
    const same = "2026-10-10T12:00:00.000Z";
    const result = validateChallengePayload(
      validPayload({startDate: same, endDate: same}),
    );
    assert.equal(result.endDate.getTime(), result.startDate.getTime());
  });
});

describe("validateChallengePayload — invalid input", () => {
  it("rejects a missing payload", () => {
    assert.equal(rejectionCode(null), "invalid-argument");
    assert.equal(rejectionCode(undefined), "invalid-argument");
    assert.equal(rejectionCode("nope"), "invalid-argument");
  });

  it("rejects a title that is too short, too long or not text", () => {
    assert.equal(rejectionCode(validPayload({title: "ab"})), "invalid-argument");
    assert.equal(
      rejectionCode(validPayload({title: "a".repeat(CHALLENGE_TITLE_MAX + 1)})),
      "invalid-argument",
    );
    assert.equal(rejectionCode(validPayload({title: 42})), "invalid-argument");
    assert.equal(rejectionCode(validPayload({title: "   "})), "invalid-argument");
    assert.equal(rejectionCode(validPayload({title: undefined})), "invalid-argument");
  });

  it(`rejects a title shorter than ${CHALLENGE_TITLE_MIN}`, () => {
    assert.equal(
      rejectionCode(validPayload({title: "a".repeat(CHALLENGE_TITLE_MIN - 1)})),
      "invalid-argument",
    );
  });

  it("rejects a description that is too short, too long or not text", () => {
    assert.equal(
      rejectionCode(validPayload({description: "too short"})),
      "invalid-argument",
    );
    assert.equal(
      rejectionCode(
        validPayload({description: "a".repeat(CHALLENGE_DESCRIPTION_MAX + 1)}),
      ),
      "invalid-argument",
    );
    assert.equal(
      rejectionCode(validPayload({description: ["x"]})),
      "invalid-argument",
    );
  });

  it("rejects an unknown or missing type", () => {
    assert.equal(
      rejectionCode(validPayload({type: "streak"})),
      "invalid-argument",
    );
    assert.equal(rejectionCode(validPayload({type: undefined})), "invalid-argument");
  });

  it("rejects a missing or unknown difficulty (CH-04)", () => {
    assert.equal(
      rejectionCode(validPayload({difficulty: undefined})),
      "invalid-argument",
    );
    assert.equal(
      rejectionCode(validPayload({difficulty: "expert"})),
      "invalid-argument",
    );
    // The stored value is 'normal' — the display label 'Easy' never counts.
    assert.equal(rejectionCode(validPayload({difficulty: "Easy"})), "invalid-argument");
    assert.equal(rejectionCode(validPayload({difficulty: 42})), "invalid-argument");
  });

  it("rejects a target outside the tier table (CH-04)", () => {
    // 500 was a legal free-text target before CH-04; under
    // single_game_score / normal the tiers are 20, 30, 40.
    assert.equal(rejectionCode(validPayload({targetValue: 500})), "invalid-argument");
    // 50 is a tier of the same type but the OTHER difficulty (hard).
    assert.equal(rejectionCode(validPayload({targetValue: 50})), "invalid-argument");
    // 10 is a tier of ANOTHER type (games_played / normal).
    assert.equal(rejectionCode(validPayload({targetValue: 10})), "invalid-argument");
  });

  it("rejects a target that is not a positive whole number in range", () => {
    assert.equal(rejectionCode(validPayload({targetValue: 0})), "invalid-argument");
    assert.equal(rejectionCode(validPayload({targetValue: -5})), "invalid-argument");
    assert.equal(rejectionCode(validPayload({targetValue: 1.5})), "invalid-argument");
    assert.equal(rejectionCode(validPayload({targetValue: "500"})), "invalid-argument");
    assert.equal(
      rejectionCode(validPayload({targetValue: 1_000_001})),
      "invalid-argument",
    );
    assert.equal(
      rejectionCode(validPayload({targetValue: undefined})),
      "invalid-argument",
    );
  });

  it("rejects missing or malformed dates", () => {
    assert.equal(
      rejectionCode(validPayload({startDate: undefined})),
      "invalid-argument",
    );
    assert.equal(
      rejectionCode(validPayload({startDate: "not-a-date"})),
      "invalid-argument",
    );
    assert.equal(
      rejectionCode(validPayload({endDate: "not-a-date"})),
      "invalid-argument",
    );
    assert.equal(
      rejectionCode(validPayload({endDate: undefined})),
      "invalid-argument",
    );
  });

  it("rejects an end date before the start date", () => {
    assert.equal(
      rejectionCode(validPayload({endDate: "2026-10-01T00:00:00.000Z"})),
      "invalid-argument",
    );
  });
});

describe("isValidInGameName", () => {
  it("accepts 3-20 characters of letters, digits and underscore", () => {
    assert.equal(isValidInGameName("abc"), true);
    assert.equal(isValidInGameName("Player_1"), true);
    assert.equal(isValidInGameName("a".repeat(IN_GAME_NAME_MAX)), true);
    assert.equal(isValidInGameName("  abc  "), true);
  });

  it("rejects too short, too long or off-charset names", () => {
    assert.equal(isValidInGameName("ab"), false);
    assert.equal(isValidInGameName("a".repeat(IN_GAME_NAME_MIN - 1)), false);
    assert.equal(isValidInGameName("a".repeat(IN_GAME_NAME_MAX + 1)), false);
    assert.equal(isValidInGameName("has space"), false);
    assert.equal(isValidInGameName("dash-name"), false);
    assert.equal(isValidInGameName(""), false);
  });

  it("rejects non-string values", () => {
    assert.equal(isValidInGameName(123), false);
    assert.equal(isValidInGameName(null), false);
    assert.equal(isValidInGameName(undefined), false);
  });
});
