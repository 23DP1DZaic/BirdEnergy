/**
 * ADM-01 — behaviour tests for the adminChallengeMutation callable.
 *
 * Runs the real handler against an in-memory Firestore double, so both halves of
 * the definition of done are covered: requests without the admin role are
 * rejected, and create/update actually persist (and are visible in the store).
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { adminChallengeMutation } from "../src/index.js";
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
    description: "Score 500 points in a single run this weekend.",
    type: "single_game_score",
    targetValue: 500,
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
      "Score 500 points in a single run this weekend.",
    );
    assert.equal(doc.type, "single_game_score");
    assert.equal(doc.targetValue, 500);
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
          targetValue: 1000,
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
    assert.equal(doc.targetValue, 1000);
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
