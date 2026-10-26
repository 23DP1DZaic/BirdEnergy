/**
 * ECON-02 — claimChallengeReward behaviour.
 *
 * The callable is the trust boundary: it resolves the challenge, its window,
 * its reward and the player's progress itself, then writes the claim and the
 * coin increment in one transaction. These tests pin:
 *   - authentication / profile / payload guards,
 *   - incomplete, expired and upcoming challenges are rejected,
 *   - a daily claim must live under the caller's own uid,
 *   - a completed claim pays exactly once (repeat, double-click, concurrent),
 *   - admin edits never unlock a second claim for the same challenge id,
 *   - a duplicate game submission does not increase progress twice.
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  claimChallengeReward,
  getDailyChallenges,
  submitGameResult,
} from "../src/index.js";
import { USER_AUTH, errorCode, wrapCallable } from "./helpers/callables.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";
import { rigaDateKey, rigaDayBounds } from "../src/dailyChallenges.js";
import type { DailyChallengeAssignment } from "../src/economy.js";

interface ClaimResult {
  ok: true;
  challengeId: string;
  source: "daily" | "admin";
  rewardCoins: number;
  coins: number;
  alreadyClaimed: boolean;
}

interface DailyResponse {
  dateKey: string;
  expiresAt: string;
  assignments: Array<{
    id: string;
    claimedAt: string | null;
    progress: number;
    completed: boolean;
  }>;
}

const claim = wrapCallable<ClaimResult>(claimChallengeReward);
const fetchDaily = wrapCallable<DailyResponse>(getDailyChallenges);
const submit = wrapCallable<unknown>(submitGameResult);

const OTHER_AUTH = {
  uid: "tg-222222222",
  token: { role: "user", telegramId: 222222222 },
};

const TZ = "Europe/Riga";

let db: ReturnType<typeof installFakeFirestore>;
let runSeq = 0;

beforeEach(() => {
  db = installFakeFirestore();
  runSeq = 0;
});

function dailyCol(uid: string): string {
  return `users/${uid}/dailyChallenges`;
}

function claimsCol(uid: string): string {
  return `users/${uid}/challengeClaims`;
}

/** A valid daily assignment (and two extra ones for the 3-item document). */
function assignment(
  dateKey: string,
  overrides: Partial<DailyChallengeAssignment> = {},
): DailyChallengeAssignment {
  return {
    id: `${dateKey}-total_jumps-20`,
    type: "total_jumps",
    difficulty: "normal",
    targetValue: 20,
    rewardCoins: 20,
    title: "Jump 20 times",
    claimedAt: null,
    ...overrides,
  };
}

interface SeededDaily {
  dateKey: string;
  startsAt: Date;
  expiresAt: Date;
  target: DailyChallengeAssignment;
}

/** Store a complete daily document for `now`'s Riga day under `uid`. */
function seedDaily(
  uid: string,
  now: Date,
  target?: DailyChallengeAssignment,
): SeededDaily {
  const dateKey = rigaDateKey(now);
  const { startsAt, expiresAt } = rigaDayBounds(dateKey);
  const chosen = target ?? assignment(dateKey);
  const extras: DailyChallengeAssignment[] = [
    {
      id: `${dateKey}-games_played-5`,
      type: "games_played",
      difficulty: "normal",
      targetValue: 5,
      rewardCoins: 30,
      title: "Play 5 games",
      claimedAt: null,
    },
    {
      id: `${dateKey}-total_score-300`,
      type: "total_score",
      difficulty: "hard",
      targetValue: 300,
      rewardCoins: 90,
      title: "Score 300 total",
      claimedAt: null,
    },
  ];
  db.seed(dailyCol(uid), dateKey, {
    dateKey,
    timezone: TZ,
    startsAt,
    expiresAt,
    assignedAt: now,
    assignments: [chosen, ...extras],
  });
  return { dateKey, startsAt, expiresAt, target: chosen };
}

function seedRun(
  uid: string,
  values: { score: number; jumpCount: number },
  createdAt: Date,
): void {
  runSeq += 1;
  db.seed("gameResults", `run-${runSeq}`, {
    uid,
    score: values.score,
    jumpCount: values.jumpCount,
    durationMs: 30_000,
    createdAt,
  });
}

function seedProfile(uid: string, coins = 0): void {
  db.seed("users", uid, {
    uid,
    bestScore: 0,
    totalGames: 0,
    totalScore: 0,
    coins,
  });
}

function seedAdminChallenge(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const now = Date.now();
  const challenge = {
    title: "Score 40 in one game",
    description: "Finish a single run with at least 40 points.",
    type: "single_game_score",
    difficulty: "normal",
    targetValue: 40,
    rewardCoins: 60,
    startDate: new Date(now - 60 * 60 * 1000),
    endDate: new Date(now + 60 * 60 * 1000),
    ...overrides,
  };
  db.seed("challenges", "admin-1", challenge);
  return challenge;
}

describe("claimChallengeReward — guards", () => {
  it("rejects an unauthenticated caller", async () => {
    assert.equal(
      await errorCode(claim({ data: { source: "daily", challengeId: "x" } })),
      "unauthenticated",
    );
    assert.deepEqual(db.rows(claimsCol(USER_AUTH.uid)), []);
  });

  it("rejects an unknown source or a malformed challenge id", async () => {
    seedProfile(USER_AUTH.uid);
    for (const data of [
      {},
      { source: "shop", challengeId: "x" },
      { source: "daily" },
      { source: "daily", challengeId: "" },
      { source: "daily", challengeId: 42 },
      { source: "daily", challengeId: "path/../traversal" },
      { source: "admin", challengeId: "a".repeat(129) },
    ]) {
      assert.equal(
        await errorCode(claim({ data, auth: USER_AUTH })),
        "invalid-argument",
      );
    }
  });

  it("rejects a player without a profile", async () => {
    assert.equal(
      await errorCode(
        claim({
          data: { source: "admin", challengeId: "admin-1" },
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
    );
  });
});

describe("claimChallengeReward — daily challenges", () => {
  it("rejects an incomplete daily challenge", async () => {
    seedProfile(USER_AUTH.uid);
    const daily = seedDaily(USER_AUTH.uid, new Date());
    seedRun(
      USER_AUTH.uid,
      { score: 1, jumpCount: 5 },
      new Date(daily.startsAt.getTime() + 1_000),
    );

    assert.equal(
      await errorCode(
        claim({
          data: { source: "daily", challengeId: daily.target.id },
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
    );
    assert.deepEqual(db.rows(claimsCol(USER_AUTH.uid)), []);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 0);
  });

  it("rejects an expired daily challenge", async () => {
    seedProfile(USER_AUTH.uid);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const daily = seedDaily(USER_AUTH.uid, yesterday);
    seedRun(
      USER_AUTH.uid,
      { score: 1, jumpCount: 25 },
      new Date(daily.startsAt.getTime() + 1_000),
    );

    assert.equal(
      await errorCode(
        claim({
          data: { source: "daily", challengeId: daily.target.id },
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
    );
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 0);
  });

  it("rejects another player's assignment", async () => {
    seedProfile(USER_AUTH.uid);
    seedProfile(OTHER_AUTH.uid);
    const theirs = seedDaily(OTHER_AUTH.uid, new Date());

    assert.equal(
      await errorCode(
        claim({
          data: { source: "daily", challengeId: theirs.target.id },
          auth: USER_AUTH,
        }),
      ),
      "not-found",
    );
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 0);
  });

  it("pays a completed daily challenge exactly once", async () => {
    seedProfile(USER_AUTH.uid);
    const daily = seedDaily(USER_AUTH.uid, new Date());
    seedRun(
      USER_AUTH.uid,
      { score: 1, jumpCount: 12 },
      new Date(daily.startsAt.getTime() + 1_000),
    );
    seedRun(
      USER_AUTH.uid,
      { score: 2, jumpCount: 8 },
      new Date(daily.startsAt.getTime() + 2_000),
    );

    const first = await claim({
      data: { source: "daily", challengeId: daily.target.id },
      auth: USER_AUTH,
    });
    assert.deepEqual(first, {
      ok: true,
      challengeId: daily.target.id,
      source: "daily",
      rewardCoins: 20,
      coins: 20,
      alreadyClaimed: false,
    });

    // The claim document is the audit trail, and the daily snapshot is marked.
    const storedClaim = db.peek(claimsCol(USER_AUTH.uid), daily.target.id);
    assert.ok(storedClaim);
    assert.equal(storedClaim.challengeId, daily.target.id);
    assert.equal(storedClaim.rewardCoins, 20);
    assert.ok(storedClaim.claimedAt instanceof Date);

    const storedDaily = db.peek(dailyCol(USER_AUTH.uid), daily.dateKey);
    assert.ok(storedDaily);
    const stored = (storedDaily.assignments as DailyChallengeAssignment[]).find(
      (candidate) => candidate.id === daily.target.id,
    );
    assert.ok(stored);
    assert.ok(stored.claimedAt instanceof Date);

    // A repeated request is a clear already-claimed answer, never a second pay.
    const second = await claim({
      data: { source: "daily", challengeId: daily.target.id },
      auth: USER_AUTH,
    });
    assert.deepEqual(second, {
      ok: true,
      challengeId: daily.target.id,
      source: "daily",
      rewardCoins: 20,
      coins: 20,
      alreadyClaimed: true,
    });
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 20);
    assert.equal(db.rows(claimsCol(USER_AUTH.uid)).length, 1);

    // The CH-05 read path now reports the assignment as claimed + completed.
    const after = await fetchDaily({ data: {}, auth: USER_AUTH });
    const item = after.assignments.find(
      (candidate) => candidate.id === daily.target.id,
    );
    assert.ok(item);
    assert.ok(typeof item.claimedAt === "string");
    assert.equal(item.completed, true);
    // Claiming never resets progress — it is still derived from the runs.
    assert.equal(item.progress, 20);
  });

  it("lets one accepted game contribute to several challenges", async () => {
    seedProfile(USER_AUTH.uid);
    const daily = seedDaily(USER_AUTH.uid, new Date());
    // One run that clears BOTH the total_jumps target and the total_score hard
    // tier stored in the same daily document.
    seedRun(
      USER_AUTH.uid,
      { score: 300, jumpCount: 25 },
      new Date(daily.startsAt.getTime() + 1_000),
    );
    const scoreId = `${daily.dateKey}-total_score-300`;

    const jumps = await claim({
      data: { source: "daily", challengeId: daily.target.id },
      auth: USER_AUTH,
    });
    const score = await claim({
      data: { source: "daily", challengeId: scoreId },
      auth: USER_AUTH,
    });

    assert.equal(jumps.rewardCoins, 20);
    assert.equal(score.rewardCoins, 90);
    assert.equal(score.coins, 110);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 110);
    assert.equal(db.rows(claimsCol(USER_AUTH.uid)).length, 2);
  });

  it("awards coins once under concurrent claims", async () => {
    seedProfile(USER_AUTH.uid);
    const daily = seedDaily(USER_AUTH.uid, new Date());
    seedRun(
      USER_AUTH.uid,
      { score: 1, jumpCount: 25 },
      new Date(daily.startsAt.getTime() + 1_000),
    );

    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        claim({
          data: { source: "daily", challengeId: daily.target.id },
          auth: USER_AUTH,
        }),
      ),
    );

    assert.equal(
      responses.filter((response) => response.alreadyClaimed === false).length,
      1,
    );
    for (const response of responses) {
      assert.equal(response.rewardCoins, 20);
      assert.equal(response.coins, 20);
    }
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 20);
    assert.equal(db.rows(claimsCol(USER_AUTH.uid)).length, 1);
  });
});

describe("claimChallengeReward — administrator challenges", () => {
  it("pays a completed admin challenge exactly once", async () => {
    seedProfile(USER_AUTH.uid);
    seedAdminChallenge();
    seedRun(
      USER_AUTH.uid,
      { score: 55, jumpCount: 9 },
      new Date(Date.now() - 30 * 60 * 1000),
    );

    const first = await claim({
      data: { source: "admin", challengeId: "admin-1" },
      auth: USER_AUTH,
    });
    assert.deepEqual(first, {
      ok: true,
      challengeId: "admin-1",
      source: "admin",
      rewardCoins: 60,
      coins: 60,
      alreadyClaimed: false,
    });

    const second = await claim({
      data: { source: "admin", challengeId: "admin-1" },
      auth: USER_AUTH,
    });
    assert.equal(second.alreadyClaimed, true);
    assert.equal(second.rewardCoins, 60);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 60);
    assert.equal(db.rows(claimsCol(USER_AUTH.uid)).length, 1);
  });

  it("does not unlock another claim after an admin edit", async () => {
    seedProfile(USER_AUTH.uid);
    seedAdminChallenge();
    seedRun(
      USER_AUTH.uid,
      { score: 55, jumpCount: 9 },
      new Date(Date.now() - 30 * 60 * 1000),
    );
    await claim({
      data: { source: "admin", challengeId: "admin-1" },
      auth: USER_AUTH,
    });

    // An edit changes the reward configuration and window...
    seedAdminChallenge({
      targetValue: 50,
      rewardCoins: 100,
      startDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    const again = await claim({
      data: { source: "admin", challengeId: "admin-1" },
      auth: USER_AUTH,
    });

    assert.equal(again.alreadyClaimed, true);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 60);
    assert.equal(db.rows(claimsCol(USER_AUTH.uid)).length, 1);
  });

  it("rejects incomplete, expired, upcoming and unconfigured challenges", async () => {
    seedProfile(USER_AUTH.uid);
    const now = Date.now();
    seedAdminChallenge();
    seedRun(
      USER_AUTH.uid,
      { score: 10, jumpCount: 1 },
      new Date(now - 30 * 60 * 1000),
    );
    // Out-of-window and other players' runs never contribute progress.
    seedRun(
      USER_AUTH.uid,
      { score: 9999, jumpCount: 1 },
      new Date(now - 2 * 60 * 60 * 1000),
    );
    seedRun(
      OTHER_AUTH.uid,
      { score: 9999, jumpCount: 1 },
      new Date(now - 30 * 60 * 1000),
    );
    assert.equal(
      await errorCode(
        claim({
          data: { source: "admin", challengeId: "admin-1" },
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
      "score 10 < target 40",
    );

    // Expired: the window is over, but the run inside it is good enough.
    seedAdminChallenge({
      startDate: new Date(now - 2 * 60 * 60 * 1000),
      endDate: new Date(now - 60 * 60 * 1000),
    });
    seedRun(
      USER_AUTH.uid,
      { score: 55, jumpCount: 1 },
      new Date(now - 90 * 60 * 1000),
    );
    assert.equal(
      await errorCode(
        claim({
          data: { source: "admin", challengeId: "admin-1" },
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
    );

    // Upcoming: even a completed-looking run may not be claimed yet.
    seedAdminChallenge({
      startDate: new Date(now + 60 * 60 * 1000),
      endDate: new Date(now + 2 * 60 * 60 * 1000),
    });
    assert.equal(
      await errorCode(
        claim({
          data: { source: "admin", challengeId: "admin-1" },
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
    );

    // Legacy document without difficulty/rewardCoins: never pays.
    seedAdminChallenge({
      type: "single_game_score",
      difficulty: undefined,
      targetValue: 40,
      rewardCoins: undefined,
    });
    assert.equal(
      await errorCode(
        claim({
          data: { source: "admin", challengeId: "admin-1" },
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
    );

    // A reward that disagrees with the tier table is a corrupt config too.
    seedAdminChallenge({ rewardCoins: 999 });
    assert.equal(
      await errorCode(
        claim({
          data: { source: "admin", challengeId: "admin-1" },
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
    );
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 0);
    assert.deepEqual(db.rows(claimsCol(USER_AUTH.uid)), []);
  });
});

describe("claimChallengeReward — progress from accepted results only", () => {
  it("a duplicate game submission does not increase progress twice", async () => {
    seedProfile(USER_AUTH.uid);
    const dateKey = rigaDateKey(new Date());
    const daily = seedDaily(
      USER_AUTH.uid,
      new Date(),
      assignment(dateKey, {
        id: `${dateKey}-total_jumps-40`,
        targetValue: 40,
        rewardCoins: 30,
        title: "Jump 40 times",
      }),
    );

    const run = {
      score: 3,
      durationMs: 10_000,
      jumpCount: 25,
      runId: "run-dup",
    };
    await submit({ data: run, auth: USER_AUTH });
    await submit({ data: run, auth: USER_AUTH });

    // One accepted run = 25 jumps < 40; counting the retry would fake 50.
    assert.equal(db.rows("gameResults").length, 1);
    assert.equal(db.peek("users", USER_AUTH.uid)?.totalGames, 1);
    assert.equal(
      await errorCode(
        claim({
          data: { source: "daily", challengeId: daily.target.id },
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
    );

    // A genuinely different run takes the total over the target.
    await submit({
      data: { ...run, runId: "run-2", score: 4 },
      auth: USER_AUTH,
    });
    const result = await claim({
      data: { source: "daily", challengeId: daily.target.id },
      auth: USER_AUTH,
    });
    assert.equal(result.alreadyClaimed, false);
    assert.equal(result.coins, 30);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 30);
    assert.equal(db.peek("users", USER_AUTH.uid)?.totalGames, 2);
  });
});
