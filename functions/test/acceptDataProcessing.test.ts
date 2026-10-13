/**
 * DATA-01 — behaviour tests for acceptDataProcessing.
 *
 * Identity comes from the Auth session only (request.auth), so the tests cover
 * the rejection paths (no session, no Telegram link) and the idempotent upsert
 * of the users/{uid} consent profile.
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { acceptDataProcessing } from "../src/index.js";
import {
  ADMIN_AUTH,
  USER_AUTH,
  errorCode,
  wrapCallable,
} from "./helpers/callables.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";

const invoke = wrapCallable<{ ok: boolean }>(acceptDataProcessing);

let db: ReturnType<typeof installFakeFirestore>;
beforeEach(() => {
  db = installFakeFirestore();
});

describe("acceptDataProcessing — authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    assert.equal(await errorCode(invoke({data: {}})), "unauthenticated");
  });

  it("rejects a session that is not linked to a Telegram account", async () => {
    assert.equal(
      await errorCode(invoke({data: {}, auth: {uid: "anon-uid", token: {}}})),
      "failed-precondition",
    );
  });

  it("rejects a non-positive Telegram id", async () => {
    assert.equal(
      await errorCode(invoke({data: {}, auth: {uid: "tg-0", token: {}}})),
      "failed-precondition",
    );
  });
});

describe("acceptDataProcessing — profile upsert", () => {
  it("creates the profile from the session claims", async () => {
    const result = await invoke({data: {}, auth: ADMIN_AUTH});
    assert.deepEqual(result, {ok: true});

    const profile = db.peek("users", ADMIN_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.uid, ADMIN_AUTH.uid);
    assert.equal(profile.telegramId, 999999999);
    assert.equal(profile.role, "admin");
    assert.equal(profile.bestScore, 0);
    assert.equal(profile.totalGames, 0);
    assert.equal(profile.totalScore, 0);
    assert.ok(profile.acceptedDataProcessingAt instanceof Date);
    assert.ok(profile.createdAt instanceof Date);
  });

  it("derives the Telegram id from the uid when the claim is missing", async () => {
    await invoke({data: {}, auth: {uid: "tg-123", token: {}}});
    const profile = db.peek("users", "tg-123");
    assert.ok(profile);
    assert.equal(profile.telegramId, 123);
  });

  it("re-consenting keeps the existing game data", async () => {
    db.seed("users", USER_AUTH.uid, {bestScore: 42, totalGames: 7});
    const result = await invoke({data: {}, auth: USER_AUTH});

    assert.deepEqual(result, {ok: true});
    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.bestScore, 42);
    assert.equal(profile.totalGames, 7);
    assert.ok(profile.acceptedDataProcessingAt instanceof Date);
  });
});
