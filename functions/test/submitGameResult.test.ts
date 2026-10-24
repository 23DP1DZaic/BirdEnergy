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
    });
    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.bestScore, 50);
  });
});
