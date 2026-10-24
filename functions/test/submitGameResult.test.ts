/**
 * DATA-01 — behaviour tests for submitGameResult.
 *
 * Covers the guard, the server-side range validation (the client is never
 * trusted) and the aggregate write: one run document plus the users/{uid}
 * bestScore/totalGames/totalScore update, all inside one transaction.
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { submitGameResult } from "../src/index.js";
import {
  USER_AUTH,
  errorCode,
  wrapCallable,
} from "./helpers/callables.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";

interface SubmitResult {
  bestScore: number;
  totalGames: number;
  totalScore: number;
  newBest: boolean;
  /** ECON-03 — coins this accepted run paid (server-derived). */
  coinsEarned: number;
  /** Balance after the write (current balance on an idempotent retry). */
  coins: number;
}

const invoke = wrapCallable<SubmitResult>(submitGameResult);

let db: ReturnType<typeof installFakeFirestore>;
beforeEach(() => {
  db = installFakeFirestore();
});

function run(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {score: 10, durationMs: 45_000, jumpCount: 12, ...overrides};
}

describe("submitGameResult — authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    assert.equal(
      await errorCode(invoke({data: run()})),
      "unauthenticated",
    );
  });
});

describe("submitGameResult — invalid input", () => {
  it("rejects a score outside 0..10000 or not an integer", async () => {
    for (const score of [-1, 1.5, 10_001, "10", null]) {
      assert.equal(
        await errorCode(invoke({data: run({score}), auth: USER_AUTH})),
        "invalid-argument",
      );
    }
  });

  it("rejects a duration outside the allowed range", async () => {
    for (const durationMs of [-1, 1.5, 21_600_001, "1000"]) {
      assert.equal(
        await errorCode(invoke({data: run({durationMs}), auth: USER_AUTH})),
        "invalid-argument",
      );
    }
  });

  it("rejects a jump count outside 0..10000", async () => {
    for (const jumpCount of [-1, 10_001, 2.5]) {
      assert.equal(
        await errorCode(invoke({data: run({jumpCount}), auth: USER_AUTH})),
        "invalid-argument",
      );
    }
  });
});

describe("submitGameResult — valid input", () => {
  it("rejects a run for a player without a profile", async () => {
    assert.equal(
      await errorCode(invoke({data: run(), auth: USER_AUTH})),
      "failed-precondition",
    );
  });

  it("stores the run and updates the aggregates", async () => {
    db.seed("users", USER_AUTH.uid, {
      bestScore: 3,
      totalGames: 1,
      totalScore: 3,
    });

    const result = await invoke({data: run({score: 10}), auth: USER_AUTH});

    assert.deepEqual(result, {
      bestScore: 10,
      totalGames: 2,
      totalScore: 13,
      newBest: true,
      // ECON-03 — 10 points = 2 coins, awarded atomically with the run.
      coinsEarned: 2,
      coins: 2,
    });

    assert.equal(db.rows("gameResults").length, 1);
    const storedRun = db.rows("gameResults")[0][1];
    assert.equal(storedRun.uid, USER_AUTH.uid);
    assert.equal(storedRun.score, 10);
    assert.equal(storedRun.durationMs, 45_000);
    assert.equal(storedRun.jumpCount, 12);
    // ECON-02: the completion time is the SERVER's clock, never the client's.
    assert.ok(storedRun.createdAt instanceof Date);

    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.bestScore, 10);
    assert.equal(profile.totalGames, 2);
    assert.equal(profile.totalScore, 13);
  });

  it("ignores a retry with the same runId (offline queue)", async () => {
    db.seed("users", USER_AUTH.uid, {
      bestScore: 0,
      totalGames: 0,
      totalScore: 0,
    });
    const run = {score: 25, durationMs: 10_000, jumpCount: 5, runId: "abc-123"};

    const first = await invoke({data: run, auth: USER_AUTH});
    const second = await invoke({data: run, auth: USER_AUTH});

    // The retry is a no-op: same totals, no second gameResults document.
    assert.equal(first.totalGames, 1);
    assert.equal(second.totalGames, 1);
    assert.equal(second.totalScore, 25);
    assert.equal(second.newBest, false);
    assert.equal(db.rows("gameResults").length, 1);
  });

  it("counts two concurrent copies of one retry exactly once", async () => {
    db.seed("users", USER_AUTH.uid, {
      bestScore: 0,
      totalGames: 0,
      totalScore: 0,
    });
    const data = {
      score: 25,
      durationMs: 10_000,
      jumpCount: 5,
      runId: "parallel-id",
    };

    const results = await Promise.all([
      invoke({data, auth: USER_AUTH}),
      invoke({data, auth: USER_AUTH}),
    ]);

    assert.equal(db.rows("gameResults").length, 1);
    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.totalGames, 1);
    assert.equal(profile.totalScore, 25);
    for (const result of results) {
      assert.equal(result.totalGames, 1);
      assert.equal(result.totalScore, 25);
    }
  });

  it("rejects reusing a runId with different result data", async () => {
    db.seed("users", USER_AUTH.uid, {
      bestScore: 0,
      totalGames: 0,
      totalScore: 0,
    });
    const runId = "same-attempt-id";
    await invoke({
      data: {score: 10, durationMs: 45_000, jumpCount: 12, runId},
      auth: USER_AUTH,
    });

    // Same id, any different accepted field → conflict, not a silent retry.
    for (const changed of [
      {score: 11, durationMs: 45_000, jumpCount: 12},
      {score: 10, durationMs: 46_000, jumpCount: 12},
      {score: 10, durationMs: 45_000, jumpCount: 13},
    ]) {
      assert.equal(
        await errorCode(invoke({data: {...changed, runId}, auth: USER_AUTH})),
        "already-exists",
      );
    }

    assert.equal(db.rows("gameResults").length, 1);
    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.totalGames, 1);
    assert.equal(profile.totalScore, 10);
    assert.equal(profile.bestScore, 10);
  });

  it("treats a malformed runId as absent rather than failing", async () => {
    db.seed("users", USER_AUTH.uid, {
      bestScore: 0,
      totalGames: 0,
      totalScore: 0,
    });
    const result = await invoke({
      data: {score: 1, durationMs: 1, jumpCount: 1, runId: "../../oops"},
      auth: USER_AUTH,
    });
    assert.equal(result.totalGames, 1);
    assert.equal(db.rows("gameResults").length, 1);
  });

  it("keeps the previous best score when the new run is lower", async () => {
    db.seed("users", USER_AUTH.uid, {
      bestScore: 50,
      totalGames: 4,
      totalScore: 100,
    });

    const result = await invoke({data: run({score: 5}), auth: USER_AUTH});

    assert.deepEqual(result, {
      bestScore: 50,
      totalGames: 5,
      totalScore: 105,
      newBest: false,
      // ECON-03 — 5 points = 1 coin (the lower score still pays its own rate).
      coinsEarned: 1,
      coins: 1,
    });
    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.bestScore, 50);
  });

  it("accepts scores at and above the GAME-05 speed-up score", async () => {
    db.seed("users", USER_AUTH.uid, {bestScore: 0, totalGames: 0, totalScore: 0});

    // Plausibility is a score/duration RANGE only — there is no assumed pipe
    // speed to trip over, so the documented +10% world speed at score 50
    // cannot make a legitimate run look impossible.
    for (const score of [50, 55, 120]) {
      const result = await invoke({
        data: {score, durationMs: 90_000, jumpCount: 30, runId: `high-${score}`},
        auth: USER_AUTH,
      });
      assert.equal(result.bestScore, score);
      assert.equal(result.coinsEarned, Math.floor(score / 5));
    }
    assert.equal(db.rows("gameResults").length, 3);
  });
});

describe("submitGameResult — gameplay coins (ECON-03)", () => {
  /** Submit one run with a fresh id and return the accepted reward. */
  async function submitScore(score: number, runId: string): Promise<SubmitResult> {
    return invoke({
      data: {score, durationMs: 30_000, jumpCount: 3, runId},
      auth: USER_AUTH,
    });
  }

  it("awards one coin per full 5 points: 0, 4, 5, 9, 10, 49, 50, 54", async () => {
    db.seed("users", USER_AUTH.uid, {coins: 0});
    const cases: Array<[score: number, coins: number]> = [
      [0, 0],
      [4, 0],
      [5, 1],
      [9, 1],
      [10, 2],
      [49, 9],
      [50, 10],
      [54, 10],
    ];

    let expectedBalance = 0;
    let index = 0;
    for (const [score, coins] of cases) {
      index += 1;
      const result = await submitScore(score, `boundary-${index}`);
      expectedBalance += coins;
      assert.equal(result.coinsEarned, coins, `score ${score} coins`);
      assert.equal(result.coins, expectedBalance, `score ${score} balance`);
      assert.equal(
        db.peek("users", USER_AUTH.uid)?.coins,
        expectedBalance,
        `score ${score} stored balance`,
      );
    }

    // Remainders are dropped per game, never carried: 4 + 5 + 9 pays 0+1+1.
    assert.equal(expectedBalance, 33);
    const storedRewards = db
      .rows("gameResults")
      .map(([, data]) => data.coinsEarned);
    assert.deepEqual(storedRewards, [0, 0, 1, 1, 2, 9, 10, 10]);
  });

  it("adds the reward to an established balance instead of replacing it", async () => {
    db.seed("users", USER_AUTH.uid, {coins: 123});

    const result = await submitScore(5, "keep-balance");

    assert.equal(result.coinsEarned, 1);
    assert.equal(result.coins, 124);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 124);
  });

  it("treats a missing balance as zero", async () => {
    db.seed("users", USER_AUTH.uid, {bestScore: 0, totalGames: 0, totalScore: 0});

    const result = await submitScore(5, "no-balance-field");

    assert.equal(result.coinsEarned, 1);
    assert.equal(result.coins, 1);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 1);
  });

  it("awards nothing for a rejected run", async () => {
    db.seed("users", USER_AUTH.uid, {coins: 7});

    assert.equal(
      await errorCode(
        invoke({
          data: {score: -1, durationMs: 10_000, jumpCount: 2, runId: "bad"},
          auth: USER_AUTH,
        }),
      ),
      "invalid-argument",
    );

    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 7);
    assert.equal(db.rows("gameResults").length, 0);
  });

  it("writes nothing when the transaction rejects (no partial award)", async () => {
    db.seed("users", USER_AUTH.uid, {coins: 10});
    await invoke({
      data: {score: 50, durationMs: 10_000, jumpCount: 2, runId: "fixed"},
      auth: USER_AUTH,
    });
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 20);

    // Same id, different data → the conflict is detected before any write.
    assert.equal(
      await errorCode(
        invoke({
          data: {score: 55, durationMs: 10_000, jumpCount: 2, runId: "fixed"},
          auth: USER_AUTH,
        }),
      ),
      "already-exists",
    );

    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 20);
    assert.equal(db.rows("gameResults").length, 1);
    assert.equal(db.peek("users", USER_AUTH.uid)?.totalGames, 1);
  });

  it("awards once for a duplicate submission and returns the accepted reward", async () => {
    db.seed("users", USER_AUTH.uid, {coins: 0});
    const runData = {
      score: 50,
      durationMs: 30_000,
      jumpCount: 4,
      runId: "duplicate-pay",
    };

    const first = await invoke({data: runData, auth: USER_AUTH});
    const second = await invoke({data: runData, auth: USER_AUTH});

    assert.equal(first.coinsEarned, 10);
    assert.equal(first.coins, 10);
    assert.equal(second.coinsEarned, 10, "retry reports the accepted reward");
    assert.equal(second.coins, 10, "retry does not pay again");
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 10);
    assert.equal(db.rows("gameResults").length, 1);
  });

  it("awards once for concurrent copies of one retry", async () => {
    db.seed("users", USER_AUTH.uid, {coins: 0});
    const runData = {
      score: 50,
      durationMs: 30_000,
      jumpCount: 4,
      runId: "parallel-pay",
    };

    const results = await Promise.all([
      invoke({data: runData, auth: USER_AUTH}),
      invoke({data: runData, auth: USER_AUTH}),
      invoke({data: runData, auth: USER_AUTH}),
    ]);

    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 10);
    assert.equal(db.rows("gameResults").length, 1);
    for (const result of results) {
      assert.equal(result.coinsEarned, 10);
      assert.equal(result.coins, 10);
    }
  });

  it("a lost response can be retried without losing or duplicating the reward", async () => {
    db.seed("users", USER_AUTH.uid, {coins: 5});
    const runData = {
      score: 9,
      durationMs: 15_000,
      jumpCount: 3,
      runId: "lost-response",
    };

    // The first call is accepted; imagine the response never reached the tab.
    await invoke({data: runData, auth: USER_AUTH});
    // Another reward lands in the meantime (a challenge claim) — the retry
    // must report the CURRENT balance, not a stale one.
    db.write("users", USER_AUTH.uid, {
      ...db.peek("users", USER_AUTH.uid),
      coins: 15,
    });

    const retry = await invoke({data: runData, auth: USER_AUTH});

    assert.equal(retry.coinsEarned, 1);
    assert.equal(retry.coins, 15);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 15);
    assert.equal(db.rows("gameResults").length, 1);
  });

  it("does not retroactively pay for a historical result", async () => {
    db.seed("users", USER_AUTH.uid, {coins: 0});
    db.seed("gameResults", `${USER_AUTH.uid}-old`, {
      uid: USER_AUTH.uid,
      score: 50,
      durationMs: 10_000,
      jumpCount: 3,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    // A retry of a pre-ECON-03 attempt: the stored row has no reward, and the
    // retry must not invent one.
    const retry = await invoke({
      data: {
        score: 50,
        durationMs: 10_000,
        jumpCount: 3,
        runId: "old",
      },
      auth: USER_AUTH,
    });

    assert.equal(retry.coinsEarned, 0);
    assert.equal(retry.coins, 0);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 0);
  });
});
