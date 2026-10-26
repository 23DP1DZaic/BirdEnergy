/**
 * ADM-01 — behaviour tests for the adminChallengeMutation callable.
 *
 * Runs the real handler against an in-memory Firestore double, so both halves of
 * the definition of done are covered: requests without the admin role are
 * rejected, and create/update actually persist (and are visible in the store).
 *
 * CH-04 — the economy layer: every one of the four types × both difficulties
 * persists with its exact ECON-01 tier reward, invalid type/difficulty/target
 * triples are refused, a client-supplied rewardCoins is ignored in favour of
 * the server-derived value, a legacy document gains reward configuration only
 * through an explicit edit, and update/delete never touch personal daily
 * assignments (users/{uid}/dailyChallenges) or claimed rewards
 * (users/{uid}/challengeClaims).
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { adminChallengeMutation } from "../src/index.js";
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_TIERS,
  CHALLENGE_TYPES,
} from "../src/economy.js";
import {
  ADMIN_AUTH,
  USER_AUTH,
  errorCode,
  wrapCallable,
} from "./helpers/callables.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";

interface MutationResult {
  ok: boolean;
  challengeId: string;
}

const invoke = wrapCallable<MutationResult>(adminChallengeMutation);

let db: ReturnType<typeof installFakeFirestore>;
beforeEach(() => {
  db = installFakeFirestore();
});

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Weekend Sprint",
    description: "Score 40 points in a single run this weekend.",
    type: "single_game_score",
    difficulty: "normal",
    // single_game_score / normal / 40 → reward 60 in the ECON-01 tier table.
    targetValue: 40,
    startDate: "2026-10-10T00:00:00.000Z",
    endDate: "2026-10-12T23:59:59.999Z",
    ...overrides,
  };
}

async function createChallenge(): Promise<string> {
  const result = await invoke({
    data: {operation: "create", payload: payload()},
    auth: ADMIN_AUTH,
  });
  return result.challengeId;
}

describe("adminChallengeMutation — authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    const code = await errorCode(
      invoke({data: {operation: "create", payload: payload()}}),
    );
    assert.equal(code, "unauthenticated");
  });

  it("rejects a signed-in caller without the admin role", async () => {
    const code = await errorCode(
      invoke({
        data: {operation: "create", payload: payload()},
        auth: USER_AUTH,
      }),
    );
    assert.equal(code, "permission-denied");
  });

  it("rejects a role claim that is missing", async () => {
    const code = await errorCode(
      invoke({
        data: {operation: "create", payload: payload()},
        auth: {uid: "tg-1", token: {}},
      }),
    );
    assert.equal(code, "permission-denied");
  });

  it("writes nothing when the caller is rejected", async () => {
    await errorCode(
      invoke({
        data: {operation: "create", payload: payload()},
        auth: USER_AUTH,
      }),
    );
    assert.equal(db.rows("challenges").length, 0);
  });

  it("rejects a non-admin caller for update and delete too (CH-04)", async () => {
    const id = await createChallenge();
    const before = db.peek("challenges", id);
    assert.ok(before);

    assert.equal(
      await errorCode(
        invoke({
          data: {operation: "update", challengeId: id, payload: payload()},
          auth: USER_AUTH,
        }),
      ),
      "permission-denied",
    );
    assert.equal(
      await errorCode(
        invoke({data: {operation: "delete", challengeId: id}, auth: USER_AUTH}),
      ),
      "permission-denied",
    );
    // Neither the document nor its fields changed.
    assert.deepEqual(db.peek("challenges", id), before);
  });
});

describe("adminChallengeMutation — input validation", () => {
  it("rejects an unknown operation", async () => {
    const code = await errorCode(
      invoke({
        data: {operation: "delete", payload: payload()},
        auth: ADMIN_AUTH,
      }),
    );
    assert.equal(code, "invalid-argument");
  });

  it("rejects an invalid payload", async () => {
    const code = await errorCode(
      invoke({
        data: {operation: "create", payload: payload({targetValue: -1})},
        auth: ADMIN_AUTH,
      }),
    );
    assert.equal(code, "invalid-argument");
  });

  it("requires a challengeId for update", async () => {
    const code = await errorCode(
      invoke({
        data: {operation: "update", payload: payload()},
        auth: ADMIN_AUTH,
      }),
    );
    assert.equal(code, "invalid-argument");
  });

  it("rejects an empty challengeId for update", async () => {
    const code = await errorCode(
      invoke({
        data: {operation: "update", challengeId: "", payload: payload()},
        auth: ADMIN_AUTH,
      }),
    );
    assert.equal(code, "invalid-argument");
  });
});

describe("adminChallengeMutation — create", () => {
  it("persists a new challenge with all fields", async () => {
    const result = await invoke({
      data: {operation: "create", payload: payload()},
      auth: ADMIN_AUTH,
    });
    assert.equal(result.ok, true);
    assert.equal(typeof result.challengeId, "string");
    assert.ok(result.challengeId.length > 0);

    const doc = db.peek("challenges", result.challengeId);
    assert.ok(doc);
    assert.equal(doc.title, "Weekend Sprint");
    assert.equal(
      doc.description,
      "Score 40 points in a single run this weekend.",
    );
    assert.equal(doc.type, "single_game_score");
    assert.equal(doc.difficulty, "normal");
    assert.equal(doc.targetValue, 40);
    // The exact tier reward for this triple — derived server-side.
    assert.equal(doc.rewardCoins, 60);
    assert.equal(
      (doc.startDate as Date).toISOString(),
      "2026-10-10T00:00:00.000Z",
    );
    assert.equal(
      (doc.endDate as Date).toISOString(),
      "2026-10-12T23:59:59.999Z",
    );
  });

  it("stamps createdBy/createdAt/updatedAt server-side", async () => {
    const id = await createChallenge();
    const doc = db.peek("challenges", id);
    assert.ok(doc);
    assert.equal(doc.createdBy, ADMIN_AUTH.uid);
    assert.ok(doc.createdAt instanceof Date);
    assert.ok(doc.updatedAt instanceof Date);
  });

  it("stores trimmed text", async () => {
    const result = await invoke({
      data: {
        operation: "create",
        payload: payload({title: "  Sprint  ", description: "  Ten chars+  "}),
      },
      auth: ADMIN_AUTH,
    });
    const doc = db.peek("challenges", result.challengeId);
    assert.ok(doc);
    assert.equal(doc.title, "Sprint");
    assert.equal(doc.description, "Ten chars+");
  });
});

describe("adminChallengeMutation — update", () => {
  it("persists changed fields", async () => {
    const id = await createChallenge();
    const result = await invoke({
      data: {
        operation: "update",
        challengeId: id,
        payload: payload({
          title: "Weekend Marathon",
          type: "games_played",
          targetValue: 10,
        }),
      },
      auth: ADMIN_AUTH,
    });
    assert.equal(result.ok, true);
    assert.equal(result.challengeId, id);

    const doc = db.peek("challenges", id);
    assert.ok(doc);
    assert.equal(doc.title, "Weekend Marathon");
    assert.equal(doc.type, "games_played");
    assert.equal(doc.difficulty, "normal");
    assert.equal(doc.targetValue, 10);
    // The reward follows the NEW triple (games_played/normal/10 → 50).
    assert.equal(doc.rewardCoins, 50);
  });

  it("keeps createdAt/createdBy and moves updatedAt", async () => {
    const id = await createChallenge();
    const before = db.peek("challenges", id);
    assert.ok(before);
    await new Promise((resolve) => setTimeout(resolve, 5));

    await invoke({
      data: {operation: "update", challengeId: id, payload: payload()},
      auth: ADMIN_AUTH,
    });

    const after = db.peek("challenges", id);
    assert.ok(after);
    assert.equal(
      (after.createdAt as Date).getTime(),
      (before.createdAt as Date).getTime(),
    );
    assert.equal(after.createdBy, before.createdBy);
    assert.ok(
      (after.updatedAt as Date).getTime() >=
        (before.updatedAt as Date).getTime(),
    );
  });

  it("rejects updating a challenge that does not exist", async () => {
    const code = await errorCode(
      invoke({
        data: {
          operation: "update",
          challengeId: "missing",
          payload: payload(),
        },
        auth: ADMIN_AUTH,
      }),
    );
    assert.equal(code, "not-found");
  });
});

describe("adminChallengeMutation — ECON-01 tiers (CH-04)", () => {
  it("creates every type × difficulty × target with its exact tier reward", async () => {
    let expected = 0;
    for (const type of CHALLENGE_TYPES) {
      for (const difficulty of CHALLENGE_DIFFICULTIES) {
        for (const tier of CHALLENGE_TIERS[type][difficulty]) {
          expected += 1;
          const result = await invoke({
            data: {
              operation: "create",
              payload: payload({
                type,
                difficulty,
                targetValue: tier.targetValue,
              }),
            },
            auth: ADMIN_AUTH,
          });
          const doc = db.peek("challenges", result.challengeId);
          assert.ok(doc, `${type}/${difficulty}/${tier.targetValue}`);
          assert.equal(doc.type, type);
          assert.equal(doc.difficulty, difficulty);
          assert.equal(doc.targetValue, tier.targetValue);
          assert.equal(
            doc.rewardCoins,
            tier.rewardCoins,
            `${type}/${difficulty}/${tier.targetValue}`,
          );
        }
      }
    }
    assert.equal(db.rows("challenges").length, expected);
  });

  it("rejects a target outside the tier table (legacy-style arbitrary value)", async () => {
    const code = await errorCode(
      invoke({
        // single_game_score / normal only allows 20, 30, 40 — 500 was a legal
        // free-text target before CH-04 and must not sneak back in.
        data: {operation: "create", payload: payload({targetValue: 500})},
        auth: ADMIN_AUTH,
      }),
    );
    assert.equal(code, "invalid-argument");
    assert.equal(db.rows("challenges").length, 0);
  });

  it("rejects a target that belongs to the other difficulty", async () => {
    // 50 exists only in single_game_score / HARD.
    assert.equal(
      await errorCode(
        invoke({
          data: {
            operation: "create",
            payload: payload({difficulty: "normal", targetValue: 50}),
          },
          auth: ADMIN_AUTH,
        }),
      ),
      "invalid-argument",
    );
    // …and 40 exists only in single_game_score / NORMAL.
    assert.equal(
      await errorCode(
        invoke({
          data: {
            operation: "create",
            payload: payload({difficulty: "hard", targetValue: 40}),
          },
          auth: ADMIN_AUTH,
        }),
      ),
      "invalid-argument",
    );
    assert.equal(db.rows("challenges").length, 0);
  });

  it("rejects an unknown type or difficulty", async () => {
    assert.equal(
      await errorCode(
        invoke({
          data: {operation: "create", payload: payload({type: "bogus"})},
          auth: ADMIN_AUTH,
        }),
      ),
      "invalid-argument",
    );
    assert.equal(
      await errorCode(
        invoke({
          data: {
            operation: "create",
            payload: payload({difficulty: "expert"}),
          },
          auth: ADMIN_AUTH,
        }),
      ),
      "invalid-argument",
    );
    assert.equal(db.rows("challenges").length, 0);
  });

  it("derives rewardCoins server-side and ignores a client-supplied one", async () => {
    const result = await invoke({
      data: {
        operation: "create",
        // The client tries to pick its own payout; the server must use 60.
        payload: payload({rewardCoins: 99999}),
      },
      auth: ADMIN_AUTH,
    });
    const doc = db.peek("challenges", result.challengeId);
    assert.ok(doc);
    assert.equal(doc.rewardCoins, 60);

    await invoke({
      data: {
        operation: "update",
        challengeId: result.challengeId,
        payload: payload({rewardCoins: 1}),
      },
      auth: ADMIN_AUTH,
    });
    const updated = db.peek("challenges", result.challengeId);
    assert.ok(updated);
    assert.equal(updated.rewardCoins, 60);
  });

  it("moves difficulty, target and reward together on update", async () => {
    const id = await createChallenge();
    await invoke({
      data: {
        operation: "update",
        challengeId: id,
        payload: payload({difficulty: "hard", targetValue: 60}),
      },
      auth: ADMIN_AUTH,
    });
    const doc = db.peek("challenges", id);
    assert.ok(doc);
    assert.equal(doc.difficulty, "hard");
    assert.equal(doc.targetValue, 60);
    assert.equal(doc.rewardCoins, 130); // single_game_score / hard / 60
  });

  it("a legacy document gains a reward configuration only via an explicit edit", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    db.seed("challenges", "legacy-1", {
      title: "Old challenge",
      description: "Created before the economy configuration existed.",
      type: "single_game_score",
      targetValue: 500,
      startDate: new Date("2026-10-10T00:00:00.000Z"),
      endDate: new Date("2026-10-12T23:59:59.999Z"),
      createdBy: "tg-000000001",
      createdAt,
      updatedAt: createdAt,
      // NOTE: no difficulty, no rewardCoins — the pre-CH-04 shape.
    });
    const before = db.peek("challenges", "legacy-1");
    assert.ok(before);
    assert.equal(before.difficulty, undefined);
    assert.equal(before.rewardCoins, undefined);

    // Explicit save through the admin form: same text, a chosen tier triple.
    await invoke({
      data: {
        operation: "update",
        challengeId: "legacy-1",
        payload: payload({
          title: "Old challenge",
          description: "Created before the economy configuration existed.",
          targetValue: 40,
        }),
      },
      auth: ADMIN_AUTH,
    });
    const after = db.peek("challenges", "legacy-1");
    assert.ok(after);
    assert.equal(after.difficulty, "normal");
    assert.equal(after.targetValue, 40);
    assert.equal(after.rewardCoins, 60);
    // The original authorship survives the edit.
    assert.equal(after.createdBy, "tg-000000001");
    assert.equal((after.createdAt as Date).getTime(), createdAt.getTime());
  });
});

describe("adminChallengeMutation — personal data stays separate (CH-04)", () => {
  it("update and delete never touch daily assignments or claims", async () => {
    const id = await createChallenge();
    const dailyCol = "users/tg-222222222/dailyChallenges";
    const claimsCol = "users/tg-222222222/challengeClaims";
    db.seed(dailyCol, "2026-10-12", {
      dateKey: "2026-10-12",
      timezone: "Europe/Riga",
      assignments: [{id: "daily-1", claimedAt: null}],
    });
    // This user already claimed the admin challenge above: the claim doc is
    // keyed by challengeId, which is what stops a second claim after edits.
    db.seed(claimsCol, id, {
      challengeId: id,
      rewardCoins: 60,
      claimedAt: new Date("2026-10-11T08:00:00.000Z"),
    });
    const dailyBefore = db.rows(dailyCol);
    const claimsBefore = db.rows(claimsCol);

    await invoke({
      data: {
        operation: "update",
        challengeId: id,
        payload: payload({difficulty: "hard", targetValue: 60}),
      },
      auth: ADMIN_AUTH,
    });
    assert.deepEqual(db.rows(dailyCol), dailyBefore);
    assert.deepEqual(db.rows(claimsCol), claimsBefore);

    await invoke({data: {operation: "delete", challengeId: id}, auth: ADMIN_AUTH});
    assert.equal(db.peek("challenges", id), undefined);
    // The player keeps both the daily assignment and the claimed reward.
    assert.deepEqual(db.rows(dailyCol), dailyBefore);
    assert.deepEqual(db.rows(claimsCol), claimsBefore);
  });
});

describe("adminChallengeMutation — delete (ADM-02)", () => {
  it("removes the challenge for good — the confirmed-delete path", async () => {
    const id = await createChallenge();
    const result = await invoke({
      data: {operation: "delete", challengeId: id},
      auth: ADMIN_AUTH,
    });
    assert.deepEqual(result, {ok: true, challengeId: id});
    assert.equal(db.peek("challenges", id), undefined);
    assert.equal(db.rows("challenges").length, 0);
  });

  it("reports not-found for an id that is already gone", async () => {
    const code = await errorCode(
      invoke({data: {operation: "delete", challengeId: "missing"}, auth: ADMIN_AUTH}),
    );
    assert.equal(code, "not-found");
  });

  it("requires a challengeId", async () => {
    const code = await errorCode(
      invoke({data: {operation: "delete"}, auth: ADMIN_AUTH}),
    );
    assert.equal(code, "invalid-argument");
  });
});
