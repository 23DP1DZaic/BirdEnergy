/**
 * ECON-01 — idempotent user initialization.
 *
 * Two layers:
 *   - buildEconomyPatch (pure): the exact backfill rules an existing
 *     users/{uid} document needs — 0 coins when absent, the 7 free skins +
 *     3 free backgrounds granted, established balances/ownership/equipped
 *     picks preserved, now-locked cosmetics replaced with the free default,
 *     economyVersion stamped.
 *   - initializeEconomy (transaction): applies that patch only when something
 *     is actually missing, never creates the profile, and writes nothing on
 *     an already-current document (second run returns false).
 *
 * Concurrency: the real backend retries the whole transaction on write
 * conflict, so concurrent sign-ins each recompute from a fresh read; the fake
 * below serialises nothing, which the concurrent test tolerates (both passes
 * must still agree on the final document).
 */
import "./setup.js";
import assert from "node:assert/strict";
import {beforeEach, describe, it} from "node:test";
import type {Firestore} from "firebase-admin/firestore";
import {
  ECONOMY_VERSION,
  FREE_BACKGROUND_IDS,
  FREE_SKIN_IDS,
  buildEconomyPatch,
} from "../src/economy.js";
import {initializeEconomy} from "../src/economyInit.js";
import {installFakeFirestore} from "./helpers/fakeFirestore.js";

describe("buildEconomyPatch — pure backfill rules", () => {
  it("starts a legacy profile at 0 coins with the free cosmetics granted", () => {
    const patch = buildEconomyPatch({
      bestScore: 42,
      totalGames: 7,
      preferredBird: 9, // index 9 = kirkbird — paid now, and nobody owns it
      preferredBackground: 12, // outside the catalog entirely
    });

    assert.equal(patch.coins, 0);
    assert.deepEqual(patch.ownedSkinIds, [...FREE_SKIN_IDS]);
    assert.deepEqual(patch.ownedBackgroundIds, [...FREE_BACKGROUND_IDS]);
    assert.equal(patch.economyVersion, ECONOMY_VERSION);
    assert.equal(patch.preferredBird, 0); // locked pick → free default
    assert.equal(patch.preferredBackground, 0);

    // Nothing outside the economy slice is touched.
    assert.equal("bestScore" in patch, false);
    assert.equal("totalGames" in patch, false);
    assert.equal("preferredGround" in patch, false); // grounds aren't priced
  });

  it("leaves fields that are legitimately absent absent", () => {
    const patch = buildEconomyPatch({coins: 0});
    assert.equal("preferredBird" in patch, false);
    assert.equal("preferredBackground" in patch, false);
  });

  it("produces an empty patch for an already-current profile", () => {
    const current = {
      coins: 750,
      ownedSkinIds: [...FREE_SKIN_IDS, "redbirdsmall"],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS, "background10"],
      economyVersion: ECONOMY_VERSION,
      preferredBird: 10, // redbirdsmall — owned → kept
      preferredBackground: 9, // background10 — owned → kept
      bestScore: 42,
    };
    assert.deepEqual(buildEconomyPatch(current), {});

    // ...and a legacy document turns current after exactly one application.
    const legacy = {preferredBird: 9};
    const once = buildEconomyPatch(legacy);
    assert.notDeepEqual(once, {});
    assert.deepEqual(buildEconomyPatch({...legacy, ...once}), {});
  });

  it("preserves a legitimate balance and ownership, in catalog order", () => {
    const patch = buildEconomyPatch({
      coins: 750,
      ownedSkinIds: ["redbirdsmall", "bird2-3"],
    });

    assert.equal(patch.coins, undefined); // balance untouched
    assert.equal(patch.economyVersion, ECONOMY_VERSION); // stamp filled
    assert.deepEqual(patch.ownedSkinIds, [
      ...FREE_SKIN_IDS.slice(0, 2),
      "bird2-3",
      ...FREE_SKIN_IDS.slice(3),
      "redbirdsmall",
    ]);
  });

  it("repairs corrupt economy fields instead of trusting them", () => {
    const patch = buildEconomyPatch({
      coins: -5,
      ownedSkinIds: "nope",
      ownedBackgroundIds: [42, null],
      preferredBird: null,
      economyVersion: NaN,
    });

    assert.equal(patch.coins, 0);
    assert.deepEqual(patch.ownedSkinIds, [...FREE_SKIN_IDS]);
    assert.deepEqual(patch.ownedBackgroundIds, [...FREE_BACKGROUND_IDS]);
    assert.equal(patch.preferredBird, 0);
    assert.equal(patch.economyVersion, ECONOMY_VERSION);
  });

  it("never downgrades a newer economy stamp", () => {
    const patch = buildEconomyPatch({
      coins: 0,
      ownedSkinIds: [...FREE_SKIN_IDS],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
      economyVersion: ECONOMY_VERSION + 1,
    });
    assert.deepEqual(patch, {});
  });
});

describe("initializeEconomy — idempotent user initialization", () => {
  let db: ReturnType<typeof installFakeFirestore>;
  beforeEach(() => {
    db = installFakeFirestore();
  });

  const run = (uid = "tg-1") => initializeEconomy(db as unknown as Firestore, uid);

  it("never creates the profile for a user without one", async () => {
    assert.equal(await run(), false);
    assert.equal(db.rows("users").length, 0);
  });

  it("backfills a legacy profile and preserves its game stats", async () => {
    db.seed("users", "tg-1", {
      uid: "tg-1",
      bestScore: 42,
      totalGames: 7,
      preferredBird: 9,
      preferredBackground: 12,
    });

    assert.equal(await run(), true);

    const profile = db.peek("users", "tg-1");
    assert.ok(profile);
    assert.equal(profile.coins, 0);
    assert.deepEqual(profile.ownedSkinIds, [...FREE_SKIN_IDS]);
    assert.deepEqual(profile.ownedBackgroundIds, [...FREE_BACKGROUND_IDS]);
    assert.equal(profile.economyVersion, ECONOMY_VERSION);
    assert.equal(profile.preferredBird, 0);
    assert.equal(profile.preferredBackground, 0);
    assert.equal(profile.bestScore, 42);
    assert.equal(profile.totalGames, 7);
  });

  it("writes nothing on a second run", async () => {
    db.seed("users", "tg-1", {uid: "tg-1", bestScore: 42, preferredBird: 0});
    assert.equal(await run(), true);
    const stored = db.peek("users", "tg-1");
    assert.ok(stored);
    const afterFirst = {...stored};

    assert.equal(await run(), false);
    assert.deepEqual(db.peek("users", "tg-1"), afterFirst);
  });

  it("preserves established balances, ownership and equipped cosmetics", async () => {
    db.seed("users", "tg-1", {
      coins: 750,
      ownedSkinIds: [...FREE_SKIN_IDS, "redbirdsmall"],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS, "background10"],
      economyVersion: ECONOMY_VERSION,
      preferredBird: 10,
      preferredBackground: 9,
      bestScore: 42,
    });

    assert.equal(await run(), false); // already current → no write at all

    const profile = db.peek("users", "tg-1");
    assert.ok(profile);
    assert.equal(profile.coins, 750);
    assert.deepEqual(profile.ownedSkinIds, [...FREE_SKIN_IDS, "redbirdsmall"]);
    assert.equal(profile.preferredBird, 10); // owned pick kept
    assert.equal(profile.preferredBackground, 9);
  });

  it("merges the free grants into partial ownership", async () => {
    db.seed("users", "tg-1", {
      ownedSkinIds: ["redbirdsmall"],
      ownedBackgroundIds: ["background7"],
      economyVersion: ECONOMY_VERSION,
    });

    assert.equal(await run(), true);

    const profile = db.peek("users", "tg-1");
    assert.ok(profile);
    assert.deepEqual(profile.ownedSkinIds, [...FREE_SKIN_IDS, "redbirdsmall"]);
    assert.deepEqual(profile.ownedBackgroundIds, [
      ...FREE_BACKGROUND_IDS,
      "background7",
    ]);
    assert.equal(profile.coins, 0); // absent balance → started at 0
    assert.equal(profile.economyVersion, ECONOMY_VERSION);
  });

  it("settles on one fully-initialized document under concurrent runs", async () => {
    db.seed("users", "tg-1", {uid: "tg-1", bestScore: 42, preferredBird: 9});

    await Promise.all([run(), run()]);

    const profile = db.peek("users", "tg-1");
    assert.ok(profile);
    assert.equal(profile.coins, 0);
    assert.deepEqual(profile.ownedSkinIds, [...FREE_SKIN_IDS]);
    assert.deepEqual(profile.ownedBackgroundIds, [...FREE_BACKGROUND_IDS]);
    assert.equal(profile.economyVersion, ECONOMY_VERSION);
    assert.equal(profile.preferredBird, 0);
    assert.equal(profile.bestScore, 42);
  });
});
