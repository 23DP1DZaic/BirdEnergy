/**
 * DATA-02 — behaviour tests for getLeaderboard.
 *
 * Both data paths are covered: "all" ranks the users/ aggregates, daily/weekly
 * rank the best run per player from gameResults inside the window. Returns only
 * display data (name, score, photoUrl).
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getLeaderboard } from "../src/index.js";
import { USER_AUTH, errorCode, wrapCallable } from "./helpers/callables.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";

interface Entry {
  name: string;
  score: number;
  photoUrl: string | null;
}

const invoke = wrapCallable<{ entries: Entry[] }>(getLeaderboard);

let db: ReturnType<typeof installFakeFirestore>;
beforeEach(() => {
  db = installFakeFirestore();
});

describe("getLeaderboard — authorization and validation", () => {
  it("rejects an unauthenticated caller", async () => {
    assert.equal(await errorCode(invoke({data: {period: "all"}})), "unauthenticated");
  });

  it("rejects an unknown or missing period", async () => {
    for (const data of [{period: "yearly"}, {}, {period: 3}]) {
      assert.equal(
        await errorCode(invoke({data, auth: USER_AUTH})),
        "invalid-argument",
      );
    }
  });
});

describe("getLeaderboard — all time", () => {
  it("ranks players by best score and resolves display names", async () => {
    db.seed("users", "tg-1", {bestScore: 100, inGameName: "Alpha", photoUrl: "p1"});
    db.seed("users", "tg-2", {bestScore: 300, username: "bravo", photoUrl: null});
    db.seed("users", "tg-3", {bestScore: 200, firstName: "Charlie"});
    db.seed("users", "tg-4", {bestScore: 50});

    const {entries} = await invoke({data: {period: "all"}, auth: USER_AUTH});

    assert.deepEqual(entries, [
      {name: "bravo", score: 300, photoUrl: null},
      {name: "Charlie", score: 200, photoUrl: null},
      {name: "Alpha", score: 100, photoUrl: "p1"},
      {name: "Player", score: 50, photoUrl: null},
    ]);
  });

  it("returns at most 10 entries", async () => {
    for (let i = 0; i < 12; i += 1) {
      db.seed("users", `tg-${i}`, {bestScore: i});
    }
    const {entries} = await invoke({data: {period: "all"}, auth: USER_AUTH});
    assert.equal(entries.length, 10);
  });
});

describe("getLeaderboard — daily and weekly", () => {
  const now = Date.now();

  function seedRuns(): void {
    db.seed("users", "tg-a", {inGameName: "Alpha"});
    db.seed("users", "tg-b", {inGameName: "Bravo"});
    db.seed("users", "tg-c", {inGameName: "Charlie"});
    db.seed("gameResults", "r1", {uid: "tg-a", score: 10, createdAt: new Date(now)});
    db.seed("gameResults", "r2", {uid: "tg-b", score: 50, createdAt: new Date(now - 2 * 60 * 60 * 1000)});
    db.seed("gameResults", "r3", {uid: "tg-c", score: 999, createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000)});
  }

  it("daily keeps only runs from the last 24 hours", async () => {
    seedRuns();
    const {entries} = await invoke({data: {period: "daily"}, auth: USER_AUTH});
    assert.deepEqual(entries, [
      {name: "Bravo", score: 50, photoUrl: null},
      {name: "Alpha", score: 10, photoUrl: null},
    ]);
  });

  it("weekly widens the window to seven days", async () => {
    seedRuns();
    const {entries} = await invoke({data: {period: "weekly"}, auth: USER_AUTH});
    assert.deepEqual(entries, [
      {name: "Charlie", score: 999, photoUrl: null},
      {name: "Bravo", score: 50, photoUrl: null},
      {name: "Alpha", score: 10, photoUrl: null},
    ]);
  });

  it("uses the best run per player", async () => {
    db.seed("users", "tg-a", {inGameName: "Alpha"});
    db.seed("gameResults", "r1", {uid: "tg-a", score: 10, createdAt: new Date(now)});
    db.seed("gameResults", "r2", {uid: "tg-a", score: 70, createdAt: new Date(now - 60_000)});
    const {entries} = await invoke({data: {period: "daily"}, auth: USER_AUTH});
    assert.deepEqual(entries, [{name: "Alpha", score: 70, photoUrl: null}]);
  });

  it("falls back to Player for a missing profile", async () => {
    db.seed("gameResults", "r1", {uid: "tg-missing", score: 5, createdAt: new Date(now)});
    const {entries} = await invoke({data: {period: "daily"}, auth: USER_AUTH});
    assert.deepEqual(entries, [{name: "Player", score: 5, photoUrl: null}]);
  });
});
