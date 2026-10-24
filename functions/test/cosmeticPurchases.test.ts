/**
 * SHOP-01 — purchaseCosmetic behaviour.
 *
 * The callable is the trust boundary: the catalog and the price are server
 * constants, and the balance check + ownership grant happen in one
 * transaction. These tests pin:
 *   - authentication, profile and payload guards,
 *   - exact / insufficient balances, server-derived prices for both catalogs,
 *   - duplicate and concurrent purchases charging once (never negative),
 *   - free items never charging coins,
 *   - ownership surviving a later sign-in backfill (initializeEconomy),
 *   - purchases staying per-player.
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { purchaseCosmetic } from "../src/index.js";
import { initializeEconomy } from "../src/economyInit.js";
import {
  FREE_BACKGROUND_IDS,
  FREE_SKIN_IDS,
  PAID_BACKGROUND_PRICE,
  PAID_SKIN_PRICE,
} from "../src/economy.js";
import { USER_AUTH, errorCode, wrapCallable } from "./helpers/callables.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";

interface PurchaseResult {
  ok: true;
  kind: "skin" | "background";
  itemId: string;
  price: number;
  alreadyOwned: boolean;
  coins: number;
  ownedSkinIds: string[];
  ownedBackgroundIds: string[];
}

const buy = wrapCallable<PurchaseResult>(purchaseCosmetic);

const OTHER_AUTH = {
  uid: "tg-222222222",
  token: { role: "user", telegramId: 222222222 },
};

/** A paid skin and a paid background from the explicit catalogs. */
const PAID_SKIN = "kirkbird";
const PAID_BACKGROUND = "background4";

let db: ReturnType<typeof installFakeFirestore>;
beforeEach(() => {
  db = installFakeFirestore();
});

function seedUser(
  uid: string,
  overrides: Record<string, unknown> = {},
): void {
  db.seed("users", uid, { uid, coins: 0, ...overrides });
}

function firestore(): Firestore {
  return db as unknown as Firestore;
}

describe("purchaseCosmetic — guards", () => {
  it("rejects an unauthenticated caller", async () => {
    assert.equal(
      await errorCode(buy({ data: { kind: "skin", itemId: PAID_SKIN } })),
      "unauthenticated",
    );
  });

  it("rejects unknown kinds, unknown items and malformed ids", async () => {
    seedUser(USER_AUTH.uid, { coins: 10_000 });
    for (const data of [
      {},
      { kind: "ground", itemId: PAID_SKIN },
      { kind: "skin" },
      { kind: "skin", itemId: "no-such-skin" },
      { kind: "skin", itemId: "bird2-1 " },
      { kind: "skin", itemId: "" },
      { kind: "skin", itemId: 7 },
      { kind: "skin", itemId: "background4" },
      { kind: "background", itemId: "kirkbird" },
      { kind: "background", itemId: "background99" },
    ]) {
      assert.equal(
        await errorCode(buy({ data, auth: USER_AUTH })),
        "invalid-argument",
      );
    }
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 10_000);
  });

  it("rejects a player without a profile", async () => {
    assert.equal(
      await errorCode(
        buy({ data: { kind: "skin", itemId: PAID_SKIN }, auth: USER_AUTH }),
      ),
      "failed-precondition",
    );
  });
});

describe("purchaseCosmetic — balance and ownership", () => {
  it("buys a skin for exactly the server price", async () => {
    seedUser(USER_AUTH.uid, { coins: PAID_SKIN_PRICE });

    const result = await buy({
      data: { kind: "skin", itemId: PAID_SKIN },
      auth: USER_AUTH,
    });

    assert.deepEqual(result, {
      ok: true,
      kind: "skin",
      itemId: PAID_SKIN,
      price: 500,
      alreadyOwned: false,
      coins: 0,
      ownedSkinIds: [...FREE_SKIN_IDS, PAID_SKIN],
      ownedBackgroundIds: [...FREE_BACKGROUND_IDS],
    });
    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.coins, 0);
    assert.deepEqual(profile.ownedSkinIds, [...FREE_SKIN_IDS, PAID_SKIN]);
  });

  it("buys a background at its own price", async () => {
    seedUser(USER_AUTH.uid, { coins: PAID_BACKGROUND_PRICE });

    const result = await buy({
      data: { kind: "background", itemId: PAID_BACKGROUND },
      auth: USER_AUTH,
    });

    assert.equal(result.price, 1000);
    assert.equal(result.coins, 0);
    assert.deepEqual(result.ownedBackgroundIds, [
      ...FREE_BACKGROUND_IDS,
      PAID_BACKGROUND,
    ]);
    assert.equal(result.ownedSkinIds.length, FREE_SKIN_IDS.length);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 0);
  });

  it("rejects a purchase one coin short and writes nothing", async () => {
    seedUser(USER_AUTH.uid, { coins: PAID_SKIN_PRICE - 1 });

    assert.equal(
      await errorCode(
        buy({ data: { kind: "skin", itemId: PAID_SKIN }, auth: USER_AUTH }),
      ),
      "failed-precondition",
    );

    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.coins, PAID_SKIN_PRICE - 1);
    assert.equal(profile.ownedSkinIds, undefined);
  });

  it("never charges again for an already owned item", async () => {
    seedUser(USER_AUTH.uid, {
      coins: PAID_SKIN_PRICE,
      ownedSkinIds: [...FREE_SKIN_IDS, PAID_SKIN],
    });

    const result = await buy({
      data: { kind: "skin", itemId: PAID_SKIN },
      auth: USER_AUTH,
    });

    assert.equal(result.alreadyOwned, true);
    assert.equal(result.coins, PAID_SKIN_PRICE);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, PAID_SKIN_PRICE);
  });

  it("charges once for a duplicate purchase", async () => {
    seedUser(USER_AUTH.uid, { coins: PAID_SKIN_PRICE });

    const first = await buy({
      data: { kind: "skin", itemId: PAID_SKIN },
      auth: USER_AUTH,
    });
    const second = await buy({
      data: { kind: "skin", itemId: PAID_SKIN },
      auth: USER_AUTH,
    });

    assert.equal(first.alreadyOwned, false);
    assert.equal(first.coins, 0);
    assert.equal(second.alreadyOwned, true);
    assert.equal(second.coins, 0);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 0);
    const owned = db.peek("users", USER_AUTH.uid)?.ownedSkinIds as string[];
    assert.equal(owned.filter((id) => id === PAID_SKIN).length, 1);
  });

  it("grants free items without charging (and without a write need)", async () => {
    seedUser(USER_AUTH.uid, { coins: 0 });

    const skin = await buy({
      data: { kind: "skin", itemId: "bird2-1" },
      auth: USER_AUTH,
    });
    const background = await buy({
      data: { kind: "background", itemId: "background2" },
      auth: USER_AUTH,
    });

    assert.equal(skin.price, 0);
    assert.equal(skin.alreadyOwned, true);
    assert.equal(skin.coins, 0);
    assert.equal(background.price, 0);
    assert.equal(background.alreadyOwned, true);
    assert.equal(background.coins, 0);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 0);
  });

  it("keeps the owned list in catalog order", async () => {
    seedUser(USER_AUTH.uid, { coins: PAID_SKIN_PRICE * 2 });

    await buy({
      data: { kind: "skin", itemId: "redbirdsmall" },
      auth: USER_AUTH,
    });
    const result = await buy({
      data: { kind: "skin", itemId: "litvinbird" },
      auth: USER_AUTH,
    });

    assert.deepEqual(result.ownedSkinIds, [
      ...FREE_SKIN_IDS,
      "litvinbird",
      "redbirdsmall",
    ]);
  });

  it("keeps purchases per player", async () => {
    seedUser(USER_AUTH.uid, { coins: PAID_SKIN_PRICE });
    seedUser(OTHER_AUTH.uid, { coins: 0 });

    await buy({ data: { kind: "skin", itemId: PAID_SKIN }, auth: USER_AUTH });

    assert.equal(db.peek("users", OTHER_AUTH.uid)?.coins, 0);
    assert.equal(db.peek("users", OTHER_AUTH.uid)?.ownedSkinIds, undefined);
  });
});

describe("purchaseCosmetic — concurrency", () => {
  it("charges once under concurrent copies of the same purchase", async () => {
    seedUser(USER_AUTH.uid, { coins: PAID_SKIN_PRICE });

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        buy({ data: { kind: "skin", itemId: PAID_SKIN }, auth: USER_AUTH }),
      ),
    );

    assert.equal(
      results.filter((result) => result.alreadyOwned === false).length,
      1,
    );
    for (const result of results) {
      assert.equal(result.coins, 0);
      assert.equal(result.price, 500);
    }
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 0);
  });

  it("never lets two different purchases spend the same coins", async () => {
    seedUser(USER_AUTH.uid, { coins: PAID_SKIN_PRICE });

    const settled = await Promise.allSettled([
      buy({ data: { kind: "skin", itemId: PAID_SKIN }, auth: USER_AUTH }),
      buy({ data: { kind: "skin", itemId: "litvinbird" }, auth: USER_AUTH }),
    ]);

    const fulfilled = settled.filter((result) => result.status === "fulfilled");
    const rejected = settled.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(
      (rejected[0] as PromiseRejectedResult).reason.code,
      "failed-precondition",
    );

    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.coins, 0, "balance never goes negative");
    const owned = profile.ownedSkinIds as string[];
    const paidOwned = owned.filter((id) => !FREE_SKIN_IDS.includes(id));
    assert.equal(paidOwned.length, 1, "exactly one of the two was granted");
  });
});

describe("purchaseCosmetic — ownership persists", () => {
  it("survives the sign-in economy backfill", async () => {
    seedUser(USER_AUTH.uid, { coins: PAID_SKIN_PRICE });
    await buy({ data: { kind: "skin", itemId: PAID_SKIN }, auth: USER_AUTH });

    // initializeEconomy is what runs on every sign-in: it must not resurrect
    // free-only ownership or reset the spent balance.
    await initializeEconomy(firestore(), USER_AUTH.uid);

    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.coins, 0);
    assert.ok((profile.ownedSkinIds as string[]).includes(PAID_SKIN));

    const again = await buy({
      data: { kind: "skin", itemId: PAID_SKIN },
      auth: USER_AUTH,
    });
    assert.equal(again.alreadyOwned, true);
    assert.equal(again.coins, 0);
    assert.equal(db.peek("users", USER_AUTH.uid)?.coins, 0);
  });
});
