/**
 * ADM-01 / UI-04 — validation tests for the server-side rules that guard the
 * admin challenge form and the in-game name.
 *
 * These exercise the trust boundary directly: src/features/challengeValidation.ts
 * (the client copy) is only instant feedback, while validateChallengePayload()
 * and isValidInGameName() in src/index.ts are what actually accept or reject a
 * request. Valid input is accepted; every documented rule is broken in turn.
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

/** A payload that passes every rule, with per-test overrides. */
function validPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    title: "Weekend Sprint",
    description: "Score 500 points in a single run this weekend.",
    type: "single_game_score",
    targetValue: 500,
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
      "Score 500 points in a single run this weekend.",
    );
    assert.equal(result.type, "single_game_score");
    assert.equal(result.targetValue, 500);
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

  it("accepts both challenge types", () => {
    assert.equal(
      validateChallengePayload(validPayload({type: "games_played"})).type,
      "games_played",
    );
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
    assert.equal(
      validateChallengePayload(validPayload({targetValue: 1})).targetValue,
      1,
    );
    assert.equal(
      validateChallengePayload(validPayload({targetValue: 1_000_000}))
        .targetValue,
      1_000_000,
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
