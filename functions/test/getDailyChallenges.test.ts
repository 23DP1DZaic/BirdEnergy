/**
 * CH-05 — automatic personal daily challenge assignment.
 *
 * Pins the task's DoD:
 *   - exactly 2 normal + 1 hard, three distinct types, targets/rewards from
 *     the ECON-01 tier table,
 *   - stable assignments across repeated calls (refresh, logout/login,
 *     multiple tabs) and ONE document under concurrent first calls,
 *   - independent state per user,
 *   - correct Europe/Riga midnight boundaries including the 23h/25h DST days,
 *   - progress from accepted gameResults inside [startsAt, expiresAt),
 *     including games finished earlier the same day and excluding other
 *     players and games outside the window,
 *   - the next Riga day gets its own set while the old one stays as history.
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { getDailyChallenges } from "../src/index.js";
import { USER_AUTH, errorCode, wrapCallable } from "./helpers/callables.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";
import {
  DAILY_CHALLENGE_TIMEZONE,
  addDaysToDateKey,
  cappedProgress,
  computeChallengeProgress,
  ensureDailyChallenge,
  generateDailyAssignments,
  isDateKey,
  readGameResultsInWindow,
  rigaDateKey,
  rigaDayBounds,
  type AcceptedGameResult,
} from "../src/dailyChallenges.js";
import {
  CHALLENGE_TIERS,
  DAILY_CHALLENGE_COUNT,
  lookupTierReward,
  type ChallengeDifficulty,
  type DailyChallengeAssignment,
  type EconomyChallengeType,
} from "../src/economy.js";

interface DailyAssignmentResponse {
  id: string;
  type: EconomyChallengeType;
  difficulty: ChallengeDifficulty;
  targetValue: number;
  rewardCoins: number;
  title: string;
  claimedAt: string | null;
  progress: number;
  completed: boolean;
}

interface DailyResponse {
  dateKey: string;
  timezone: string;
  startsAt: string;
  expiresAt: string;
  assignments: DailyAssignmentResponse[];
}

const invoke = wrapCallable<DailyResponse>(getDailyChallenges);

const OTHER_AUTH = {
  uid: "tg-222222222",
  token: { role: "user", telegramId: 222222222 },
};

function dailyCol(uid: string): string {
  return `users/${uid}/dailyChallenges`;
}

/** Deterministic RNG (LCG) so generated sets are reproducible in tests. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function hoursBetween(startsAt: Date, expiresAt: Date): number {
  return (expiresAt.getTime() - startsAt.getTime()) / (60 * 60 * 1000);
}

/** A fixed, valid snapshot used to test "stored wins over generated". */
function fixedAssignments(): DailyChallengeAssignment[] {
  return [
    {
      id: "fixed-jumps",
      type: "total_jumps",
      difficulty: "normal",
      targetValue: 20,
      rewardCoins: 20,
      title: "Jump 20 times",
      claimedAt: null,
    },
    {
      id: "fixed-games",
      type: "games_played",
      difficulty: "normal",
      targetValue: 5,
      rewardCoins: 30,
      title: "Play 5 games",
      claimedAt: null,
    },
    {
      id: "fixed-score",
      type: "total_score",
      difficulty: "hard",
      targetValue: 300,
      rewardCoins: 90,
      title: "Score 300 total",
      claimedAt: null,
    },
  ];
}

let db: ReturnType<typeof installFakeFirestore>;
beforeEach(() => {
  db = installFakeFirestore();
});

/** The fake implements the subset these helpers use; cast as the other
 *  function tests do (see economyInit.test.ts). */
function firestore(): Firestore {
  return db as unknown as Firestore;
}

describe("getDailyChallenges — authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    assert.equal(await errorCode(invoke({ data: {} })), "unauthenticated");
    // Nothing was created for a caller without a session.
    assert.deepEqual(db.rows(dailyCol(USER_AUTH.uid)), []);
  });
});

describe("getDailyChallenges — assignment mix and shape", () => {
  it("creates exactly two normal and one hard, with three distinct types", async () => {
    const data = await invoke({ data: {}, auth: USER_AUTH });

    assert.equal(data.assignments.length, DAILY_CHALLENGE_COUNT);
    const normal = data.assignments.filter((a) => a.difficulty === "normal");
    const hard = data.assignments.filter((a) => a.difficulty === "hard");
    assert.equal(normal.length, 2);
    assert.equal(hard.length, 1);
    assert.equal(new Set(data.assignments.map((a) => a.type)).size, 3);
  });

  it("selects only allowed targets and their configured rewards", async () => {
    const data = await invoke({ data: {}, auth: USER_AUTH });

    for (const assignment of data.assignments) {
      const tiers = CHALLENGE_TIERS[assignment.type][assignment.difficulty];
      assert.ok(
        tiers.some((tier) => tier.targetValue === assignment.targetValue),
        `${assignment.type}/${assignment.difficulty}/${assignment.targetValue}`,
      );
      assert.equal(
        assignment.rewardCoins,
        lookupTierReward(
          assignment.type,
          assignment.difficulty,
          assignment.targetValue,
        ),
      );
      assert.ok(assignment.title.length > 0);
      assert.equal(assignment.claimedAt, null, "unclaimed on assignment");
      assert.equal(assignment.progress, 0);
      assert.equal(assignment.completed, false);
    }
  });

  it("returns only the required fields and the true Riga day window", async () => {
    const before = rigaDateKey(new Date());
    const data = await invoke({ data: {}, auth: USER_AUTH });
    const after = rigaDateKey(new Date());

    // A call that straddles midnight may legitimately return either day.
    assert.ok([before, after].includes(data.dateKey));
    assert.equal(data.timezone, DAILY_CHALLENGE_TIMEZONE);

    const bounds = rigaDayBounds(data.dateKey);
    assert.equal(data.startsAt, bounds.startsAt.toISOString());
    assert.equal(data.expiresAt, bounds.expiresAt.toISOString());

    for (const assignment of data.assignments) {
      assert.deepEqual(Object.keys(assignment).sort(), [
        "claimedAt",
        "completed",
        "difficulty",
        "id",
        "progress",
        "rewardCoins",
        "targetValue",
        "title",
        "type",
      ]);
    }
    // No uid, no profile, no game history leaks into the response.
    assert.deepEqual(Object.keys(data).sort(), [
      "assignments",
      "dateKey",
      "expiresAt",
      "startsAt",
      "timezone",
    ]);
  });

  it("stores the snapshot with claimedAt null and a single timer field", async () => {
    const data = await invoke({ data: {}, auth: USER_AUTH });
    const stored = db.peek(dailyCol(USER_AUTH.uid), data.dateKey);
    assert.ok(stored);
    assert.equal(stored.dateKey, data.dateKey);
    assert.equal(stored.timezone, DAILY_CHALLENGE_TIMEZONE);
    assert.ok(stored.assignedAt instanceof Date);
    assert.ok(stored.startsAt instanceof Date);
    assert.ok(stored.expiresAt instanceof Date);
    const assignments = stored.assignments as DailyChallengeAssignment[];
    assert.equal(assignments.length, 3);
    for (const assignment of assignments) {
      assert.equal(assignment.claimedAt, null);
      // The snapshot keeps its own id/type/difficulty/target/reward/title.
      assert.ok(assignment.id.startsWith(data.dateKey));
      assert.ok(assignment.rewardCoins > 0);
    }
  });
});

describe("getDailyChallenges — stable stored assignments", () => {
  it("returns the same assignments on every call", async () => {
    const first = await invoke({ data: {}, auth: USER_AUTH });
    const assignedAt = (db.peek(dailyCol(USER_AUTH.uid), first.dateKey) as {
      assignedAt: Date;
    }).assignedAt;

    const second = await invoke({ data: {}, auth: USER_AUTH });
    const third = await invoke({ data: {}, auth: USER_AUTH });

    assert.deepEqual(second, first);
    assert.deepEqual(third, first);
    assert.equal(db.rows(dailyCol(USER_AUTH.uid)).length, 1);
    assert.equal(
      (db.peek(dailyCol(USER_AUTH.uid), first.dateKey) as {
        assignedAt: Date;
      }).assignedAt.getTime(),
      assignedAt.getTime(),
      "repeated calls never restamp or reroll",
    );
  });

  it("keeps an existing stored set instead of generating a new one", async () => {
    const dateKey = rigaDateKey(new Date());
    const bounds = rigaDayBounds(dateKey);
    db.seed(dailyCol(USER_AUTH.uid), dateKey, {
      dateKey,
      timezone: DAILY_CHALLENGE_TIMEZONE,
      startsAt: bounds.startsAt,
      expiresAt: bounds.expiresAt,
      assignedAt: new Date("2026-01-01T00:00:00.000Z"),
      assignments: fixedAssignments(),
    });

    const data = await invoke({ data: {}, auth: USER_AUTH });
    assert.deepEqual(
      data.assignments.map((a) => a.id),
      ["fixed-jumps", "fixed-games", "fixed-score"],
    );
  });

  it("regenerates a corrupt stored document instead of returning it", async () => {
    const dateKey = rigaDateKey(new Date());
    const bounds = rigaDayBounds(dateKey);
    db.seed(dailyCol(USER_AUTH.uid), dateKey, {
      dateKey,
      timezone: DAILY_CHALLENGE_TIMEZONE,
      startsAt: bounds.startsAt,
      expiresAt: bounds.expiresAt,
      assignedAt: new Date(),
      assignments: [{ id: "half", type: "total_jumps" }],
    });

    const data = await invoke({ data: {}, auth: USER_AUTH });
    assert.equal(data.assignments.length, 3);
    const stored = db.peek(dailyCol(USER_AUTH.uid), dateKey);
    assert.ok(stored);
    assert.equal((stored.assignments as unknown[]).length, 3);
  });
});

describe("getDailyChallenges — concurrency", () => {
  it("creates one daily set under concurrent first requests", async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => invoke({ data: {}, auth: USER_AUTH })),
    );

    for (const response of responses) {
      assert.deepEqual(response, responses[0]);
    }
    assert.equal(db.rows(dailyCol(USER_AUTH.uid)).length, 1);
    assert.equal(
      (db.peek(dailyCol(USER_AUTH.uid), responses[0].dateKey) as {
        assignments: unknown[];
      }).assignments.length,
      3,
    );
  });
});

describe("getDailyChallenges — per-user independence", () => {
  it("gives each player their own document and assignments", async () => {
    const dateKey = rigaDateKey(new Date());
    const bounds = rigaDayBounds(dateKey);
    db.seed(dailyCol(USER_AUTH.uid), dateKey, {
      dateKey,
      timezone: DAILY_CHALLENGE_TIMEZONE,
      startsAt: bounds.startsAt,
      expiresAt: bounds.expiresAt,
      assignedAt: new Date("2020-01-01T00:00:00.000Z"),
      assignments: fixedAssignments(),
    });

    const mine = await invoke({ data: {}, auth: USER_AUTH });
    const theirs = await invoke({ data: {}, auth: OTHER_AUTH });

    assert.deepEqual(
      mine.assignments.map((a) => a.id),
      ["fixed-jumps", "fixed-games", "fixed-score"],
    );
    assert.equal(theirs.assignments.length, 3);
    assert.ok(
      theirs.assignments.every((a) => !a.id.startsWith("fixed-")),
      "the other player never receives my stored set",
    );

    const storedMine = db.peek(dailyCol(USER_AUTH.uid), dateKey);
    assert.ok(storedMine);
    assert.deepEqual(
      (storedMine?.assignments as DailyChallengeAssignment[]).map((a) => a.id),
      ["fixed-jumps", "fixed-games", "fixed-score"],
    );
    const storedTheirs = db.peek(dailyCol(OTHER_AUTH.uid), theirs.dateKey);
    assert.ok(storedTheirs);
    assert.deepEqual(
      (storedTheirs.assignments as DailyChallengeAssignment[]).map((a) => a.id),
      theirs.assignments.map((a) => a.id),
    );
    assert.equal(db.rows(dailyCol(OTHER_AUTH.uid)).length, 1);
  });
});

describe("daily challenge day math — Europe/Riga", () => {
  it("flips the dateKey at Riga midnight, not at UTC midnight", () => {
    // 2026-10-24 is EEST (UTC+3) until the 25th's 04:00 local switch.
    assert.equal(rigaDateKey(new Date("2026-10-24T20:59:59.999Z")), "2026-10-24");
    assert.equal(rigaDateKey(new Date("2026-10-24T21:00:00.000Z")), "2026-10-25");
    // The fall-back day lasts 25 hours, so its second midnight is 22:00 UTC.
    assert.equal(rigaDateKey(new Date("2026-10-25T21:59:59.999Z")), "2026-10-25");
    assert.equal(rigaDateKey(new Date("2026-10-25T22:00:00.000Z")), "2026-10-26");
    // Winter is EET (UTC+2): local midnight is 22:00 UTC the day before.
    assert.equal(rigaDateKey(new Date("2026-01-14T21:59:59.999Z")), "2026-01-14");
    assert.equal(rigaDateKey(new Date("2026-01-14T22:00:00.000Z")), "2026-01-15");
  });

  it("returns correct UTC bounds for a normal 24-hour day", () => {
    const { startsAt, expiresAt } = rigaDayBounds("2026-07-15");
    assert.equal(startsAt.toISOString(), "2026-07-14T21:00:00.000Z");
    assert.equal(expiresAt.toISOString(), "2026-07-15T21:00:00.000Z");
    assert.equal(hoursBetween(startsAt, expiresAt), 24);
  });

  it("makes the spring-forward day 23 hours long", () => {
    const { startsAt, expiresAt } = rigaDayBounds("2026-03-29");
    assert.equal(startsAt.toISOString(), "2026-03-28T22:00:00.000Z");
    assert.equal(expiresAt.toISOString(), "2026-03-29T21:00:00.000Z");
    assert.equal(hoursBetween(startsAt, expiresAt), 23);
  });

  it("makes the autumn fall-back day 25 hours long", () => {
    const { startsAt, expiresAt } = rigaDayBounds("2026-10-25");
    assert.equal(startsAt.toISOString(), "2026-10-24T21:00:00.000Z");
    assert.equal(expiresAt.toISOString(), "2026-10-25T22:00:00.000Z");
    assert.equal(hoursBetween(startsAt, expiresAt), 25);
  });

  it("keeps consecutive days contiguous across both transitions", () => {
    for (const key of [
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]) {
      const today = rigaDayBounds(key);
      const tomorrow = rigaDayBounds(addDaysToDateKey(key, 1));
      assert.equal(
        today.expiresAt.getTime(),
        tomorrow.startsAt.getTime(),
        `${key} must end exactly when the next day starts`,
      );
    }
  });

  it("rejects impossible or malformed date keys", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "15-01-2026", "today"]) {
      assert.equal(isDateKey(bad), false, bad);
      assert.throws(() => rigaDayBounds(bad), `should throw for ${bad}`);
    }
    assert.equal(isDateKey("2026-02-28"), true);
  });
});

describe("daily assignment generation", () => {
  it("always produces 2 normal + 1 hard, distinct types, allowed tiers", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const set = generateDailyAssignments("2026-10-24", seededRandom(seed));
      assert.equal(set.length, 3);
      assert.equal(set.filter((a) => a.difficulty === "normal").length, 2);
      assert.equal(set.filter((a) => a.difficulty === "hard").length, 1);
      assert.equal(new Set(set.map((a) => a.type)).size, 3);
      for (const assignment of set) {
        assert.equal(
          lookupTierReward(
            assignment.type,
            assignment.difficulty,
            assignment.targetValue,
          ),
          assignment.rewardCoins,
        );
        assert.ok(assignment.id.startsWith("2026-10-24-"));
        assert.equal(assignment.claimedAt, null);
      }
      assert.equal(new Set(set.map((a) => a.id)).size, 3);
    }
  });

  it("is reproducible for a given random source and never id-crosses days", () => {
    assert.deepEqual(
      generateDailyAssignments("2026-10-24", seededRandom(99)),
      generateDailyAssignments("2026-10-24", seededRandom(99)),
    );
    const today = generateDailyAssignments("2026-10-24", seededRandom(99));
    const tomorrow = generateDailyAssignments("2026-10-25", seededRandom(99));
    for (let i = 0; i < 3; i += 1) {
      assert.notEqual(today[i].id, tomorrow[i].id);
    }
  });
});

describe("daily challenge progress — accepted results in the window", () => {
  const DATE = "2026-10-24";
  const bounds = rigaDayBounds(DATE);

  function seedResults(): void {
    db.seed("gameResults", "in-1", {
      uid: USER_AUTH.uid,
      score: 10,
      jumpCount: 3,
      createdAt: bounds.startsAt,
    });
    db.seed("gameResults", "in-2", {
      uid: USER_AUTH.uid,
      score: 25,
      jumpCount: 7,
      createdAt: new Date(bounds.startsAt.getTime() + 60 * 60 * 1000),
    });
    db.seed("gameResults", "in-3", {
      uid: USER_AUTH.uid,
      score: 5,
      jumpCount: 2,
      createdAt: new Date(bounds.expiresAt.getTime() - 1),
    });
    // One millisecond before the day starts — previous day, excluded.
    db.seed("gameResults", "before", {
      uid: USER_AUTH.uid,
      score: 999,
      jumpCount: 500,
      createdAt: new Date(bounds.startsAt.getTime() - 1),
    });
    // Exactly at expiry — the window is half-open, excluded.
    db.seed("gameResults", "after", {
      uid: USER_AUTH.uid,
      score: 999,
      jumpCount: 500,
      createdAt: bounds.expiresAt,
    });
    // Another player's run inside the window — never counted.
    db.seed("gameResults", "other", {
      uid: OTHER_AUTH.uid,
      score: 999,
      jumpCount: 500,
      createdAt: new Date(bounds.startsAt.getTime() + 60_000),
    });
  }

  it("reads only this player's accepted runs inside [startsAt, expiresAt)", async () => {
    seedResults();
    const results = await readGameResultsInWindow(firestore(), USER_AUTH.uid, bounds);
    assert.equal(results.length, 3);
    assert.deepEqual(
      results.map((r) => r.score).sort((a, b) => a - b),
      [5, 10, 25],
    );
  });

  it("computes all four challenge types from those runs", async () => {
    seedResults();
    const results: AcceptedGameResult[] = await readGameResultsInWindow(
      firestore(),
      USER_AUTH.uid,
      bounds,
    );
    assert.equal(computeChallengeProgress("total_jumps", results), 12);
    assert.equal(computeChallengeProgress("games_played", results), 3);
    assert.equal(computeChallengeProgress("single_game_score", results), 25);
    assert.equal(computeChallengeProgress("total_score", results), 40);
    assert.equal(computeChallengeProgress("total_jumps", []), 0);
    assert.equal(computeChallengeProgress("single_game_score", []), 0);
    assert.equal(cappedProgress(12, 10), 10);
    assert.equal(cappedProgress(3, 10), 3);
  });

  it("counts games finished earlier the same day when the callable runs", async () => {
    const first = await invoke({ data: {}, auth: USER_AUTH });
    // Runs finished earlier on the same Riga day (at the stored window start).
    const windowStart = new Date(first.startsAt);
    const earlier = new Date(windowStart.getTime() + 1_000);
    db.seed("gameResults", "today-1", {
      uid: USER_AUTH.uid,
      score: 7,
      jumpCount: 2,
      createdAt: earlier,
      durationMs: 12_000,
    });
    db.seed("gameResults", "today-2", {
      uid: USER_AUTH.uid,
      score: 12,
      jumpCount: 5,
      createdAt: new Date(earlier.getTime() + 1_000),
    });
    // Excluded: before the day, after it, and another player.
    db.seed("gameResults", "yesterday", {
      uid: USER_AUTH.uid,
      score: 500,
      jumpCount: 100,
      createdAt: new Date(windowStart.getTime() - 1),
    });

    const second = await invoke({ data: {}, auth: USER_AUTH });

    assert.equal(second.dateKey, first.dateKey);
    assert.deepEqual(
      second.assignments.map((a) => a.id),
      first.assignments.map((a) => a.id),
      "progress updates never reroll the assignments",
    );

    const totals = { games_played: 2, total_jumps: 7, total_score: 19 };
    for (const assignment of second.assignments) {
      const raw =
        assignment.type === "single_game_score"
          ? 12
          : totals[assignment.type as keyof typeof totals];
      assert.equal(
        assignment.progress,
        Math.min(raw, assignment.targetValue),
        `${assignment.type} progress`,
      );
      assert.equal(
        assignment.completed,
        raw >= assignment.targetValue,
        `${assignment.type} completion`,
      );
    }
  });
});

describe("daily challenges — next day and history", () => {
  it("creates a new set for the next Riga day and leaves the old one untouched", async () => {
    const firstNow = new Date("2026-10-24T10:00:00.000Z");
    const first = await ensureDailyChallenge(
      firestore(),
      USER_AUTH.uid,
      firstNow,
      seededRandom(11),
    );
    assert.equal(first.created, true);
    assert.equal(first.dateKey, "2026-10-24");
    const storedFirst = db.peek(dailyCol(USER_AUTH.uid), "2026-10-24");
    assert.ok(storedFirst);

    // Later the same day: the stored set is returned (no reroll).
    const sameDay = await ensureDailyChallenge(
      firestore(),
      USER_AUTH.uid,
      new Date("2026-10-24T20:59:59.999Z"),
      seededRandom(12),
    );
    assert.equal(sameDay.created, false);
    assert.deepEqual(
      sameDay.assignments.map((a) => a.id),
      first.assignments.map((a) => a.id),
    );

    // Just after Riga midnight the next day's document is created.
    const second = await ensureDailyChallenge(
      firestore(),
      USER_AUTH.uid,
      new Date("2026-10-24T21:00:00.000Z"),
      seededRandom(13),
    );
    assert.equal(second.created, true);
    assert.equal(second.dateKey, "2026-10-25");
    assert.equal(
      first.expiresAt.getTime(),
      second.startsAt.getTime(),
      "the new day starts exactly when the old one expires",
    );

    assert.deepEqual(db.peek(dailyCol(USER_AUTH.uid), "2026-10-24"), storedFirst);
    assert.equal(db.rows(dailyCol(USER_AUTH.uid)).length, 2);

    // Previous unclaimed rewards are not carried into the new day.
    assert.equal(second.assignments.length, 3);
    for (const assignment of second.assignments) {
      assert.equal(assignment.claimedAt, null);
    }
  });
});
