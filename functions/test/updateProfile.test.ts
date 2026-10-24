/**
 * UI-04 — behaviour tests for updateProfile.
 *
 * The Profile screen only edits the caller's own users/{uid} document, so the
 * tests drive valid input (name + appearance preferences), invalid input
 * (name rules, preference ranges, empty patch) and the name-uniqueness check.
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { updateProfile } from "../src/index.js";
import {
  USER_AUTH,
  errorCode,
  wrapCallable,
} from "./helpers/callables.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";

interface UpdateResult {
  ok: boolean;
  inGameName: string;
}

const invoke = wrapCallable<UpdateResult>(updateProfile);

let db: ReturnType<typeof installFakeFirestore>;
beforeEach(() => {
  db = installFakeFirestore();
  db.seed("users", USER_AUTH.uid, {bestScore: 0, inGameName: "Old_Name"});
});

describe("updateProfile — authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    assert.equal(
      await errorCode(invoke({data: {username: "New_Name"}})),
      "unauthenticated",
    );
  });
});

describe("updateProfile — invalid input", () => {
  it("rejects an empty patch", async () => {
    assert.equal(
      await errorCode(invoke({data: {}, auth: USER_AUTH})),
      "invalid-argument",
    );
  });

  it("rejects names that break the 3-20 [A-Za-z0-9_] rule", async () => {
    for (const username of ["ab", "a".repeat(21), "has space", "dash-name", ""]) {
      assert.equal(
        await errorCode(invoke({data: {username}, auth: USER_AUTH})),
        "invalid-argument",
      );
    }
  });

  it("rejects out-of-range appearance preference indices", async () => {
    for (const field of ["preferredBird", "preferredBackground", "preferredGround"]) {
      assert.equal(
        await errorCode(invoke({data: {[field]: -1}, auth: USER_AUTH})),
        "invalid-argument",
      );
      assert.equal(
        await errorCode(invoke({data: {[field]: 1.5}, auth: USER_AUTH})),
        "invalid-argument",
      );
    }
  });
});

describe("updateProfile — valid input", () => {
  it("saves a new in-game name", async () => {
    const result = await invoke({
      data: {username: "New_Name"},
      auth: USER_AUTH,
    });
    assert.deepEqual(result, {ok: true, inGameName: "New_Name"});
    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.inGameName, "New_Name");
  });

  it("trims the name before saving it", async () => {
    const result = await invoke({
      data: {username: "  Padded  "},
      auth: USER_AUTH,
    });
    assert.equal(result.inGameName, "Padded");
    assert.equal(db.peek("users", USER_AUTH.uid)?.inGameName, "Padded");
  });

  it("saves appearance preferences without touching the name", async () => {
    const result = await invoke({
      data: {preferredBird: 3, preferredBackground: 2, preferredGround: 1},
      auth: USER_AUTH,
    });
    assert.equal(result.ok, true);
    assert.equal(result.inGameName, "Old_Name");
    const profile = db.peek("users", USER_AUTH.uid);
    assert.ok(profile);
    assert.equal(profile.preferredBird, 3);
    assert.equal(profile.preferredBackground, 2);
    assert.equal(profile.preferredGround, 1);
    assert.equal(profile.inGameName, "Old_Name");
  });

  it("rejects a name already taken by someone else", async () => {
    db.seed("users", "tg-999999999", {inGameName: "Taken"});
    assert.equal(
      await errorCode(invoke({data: {username: "Taken"}, auth: USER_AUTH})),
      "already-exists",
    );
  });

  it("allows keeping your own name", async () => {
    const result = await invoke({
      data: {username: "Old_Name"},
      auth: USER_AUTH,
    });
    assert.equal(result.inGameName, "Old_Name");
  });

  it("rejects a player without a profile", async () => {
    assert.equal(
      await errorCode(
        invoke({data: {username: "Fresh_Name"}, auth: {uid: "tg-222222222", token: {role: "user"}}}),
      ),
      "failed-precondition",
    );
  });
});

describe("updateProfile — equipping locked cosmetics (SHOP-01)", () => {
  const PAID_SKIN_INDEX = 7 // kirkbird — index-aligned with SKIN_IDS
  const PAID_BACKGROUND_INDEX = 3 // background4

  it("rejects a paid skin the account does not own", async () => {
    assert.equal(
      await errorCode(
        invoke({data: {preferredBird: PAID_SKIN_INDEX}, auth: USER_AUTH}),
      ),
      "failed-precondition",
    );
    assert.equal(db.peek("users", USER_AUTH.uid)?.preferredBird, undefined);
  });

  it("rejects a paid background the account does not own", async () => {
    assert.equal(
      await errorCode(
        invoke({
          data: {preferredBackground: PAID_BACKGROUND_INDEX},
          auth: USER_AUTH,
        }),
      ),
      "failed-precondition",
    );
    assert.equal(
      db.peek("users", USER_AUTH.uid)?.preferredBackground,
      undefined,
    );
  });

  it("equips a paid skin that the server ownership list contains", async () => {
    db.seed("users", USER_AUTH.uid, {
      inGameName: "Old_Name",
      ownedSkinIds: ["kirkbird"],
    });

    const result = await invoke({
      data: {preferredBird: PAID_SKIN_INDEX},
      auth: USER_AUTH,
    });

    assert.equal(result.ok, true);
    assert.equal(
      db.peek("users", USER_AUTH.uid)?.preferredBird,
      PAID_SKIN_INDEX,
    );
  });

  it("equips a paid background that the server ownership list contains", async () => {
    db.seed("users", USER_AUTH.uid, {
      inGameName: "Old_Name",
      ownedBackgroundIds: ["background4"],
    });

    const result = await invoke({
      data: {preferredBackground: PAID_BACKGROUND_INDEX},
      auth: USER_AUTH,
    });

    assert.equal(result.ok, true);
    assert.equal(
      db.peek("users", USER_AUTH.uid)?.preferredBackground,
      PAID_BACKGROUND_INDEX,
    );
  });

  it("allows the explicit free sets without any ownership list", async () => {
    const result = await invoke({
      data: {preferredBird: 6, preferredBackground: 2},
      auth: USER_AUTH,
    });

    assert.equal(result.ok, true);
    assert.equal(db.peek("users", USER_AUTH.uid)?.preferredBird, 6);
    assert.equal(db.peek("users", USER_AUTH.uid)?.preferredBackground, 2);
  });

  it("rejects an index outside the catalog even if it is a number", async () => {
    for (const data of [{preferredBird: 11}, {preferredBackground: 10}]) {
      assert.equal(
        await errorCode(invoke({data, auth: USER_AUTH})),
        "invalid-argument",
      );
    }
  });
});
