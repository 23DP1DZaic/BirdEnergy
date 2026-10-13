/**
 * AUTH-02 / AUTH-03 — unit tests for the Telegram auth module.
 *
 * Pure functions only (Node crypto), so no emulator or credentials are needed.
 * Every rule is checked from both sides: a valid input is accepted and each way
 * of corrupting it is rejected with the matching reason.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_AUTH_AGE_SECONDS,
  buildDataCheckString,
  buildTelegramUid,
  computeExpectedHash,
  hashesEqual,
  parseAdminTelegramIds,
  parseInitData,
  resolveDevTelegramUser,
  resolveUserRole,
  validateTelegramInitData,
} from "../src/telegramAuth.js";

const BOT_TOKEN = "123456:TEST_TOKEN";
const NOW = 1_700_000_000;

/** Builds a correctly signed initData string the way Telegram would. */
function signedInitData(overrides: Record<string, string> = {}): string {
  const params: Record<string, string> = {
    auth_date: String(NOW),
    query_id: "AAA-1",
    user: JSON.stringify({
      id: 42,
      first_name: "Ada",
      last_name: "Lovelace",
      username: "ada",
      language_code: "en",
      photo_url: "https://example.com/ada.png",
    }),
    ...overrides,
  };
  const hash = computeExpectedHash(params, BOT_TOKEN);
  return new URLSearchParams({...params, hash}).toString();
}

describe("parseInitData", () => {
  it("parses a well-formed initData string", () => {
    const parsed = parseInitData("user=%7B%22id%22%3A1%7D&hash=abc&auth_date=1");
    assert.ok(parsed);
    assert.equal(parsed.user, JSON.stringify({id: 1}));
    assert.equal(parsed.hash, "abc");
    assert.equal(parsed.auth_date, "1");
  });

  it("rejects an empty string", () => {
    assert.equal(parseInitData(""), null);
  });

  it("rejects oversized payloads", () => {
    assert.equal(parseInitData(`user=x&hash=y&pad=${"a".repeat(4096)}`), null);
  });

  it("rejects a duplicate key", () => {
    assert.equal(parseInitData("user=1&user=2&hash=x"), null);
  });

  it("rejects a payload without a hash", () => {
    assert.equal(parseInitData("user=1&auth_date=1"), null);
  });

  it("rejects a payload without a user", () => {
    assert.equal(parseInitData("hash=1&auth_date=1"), null);
  });
});

describe("buildDataCheckString", () => {
  it("excludes the hash and sorts by key", () => {
    assert.equal(
      buildDataCheckString({hash: "x", b: "2", a: "1"}),
      "a=1\nb=2",
    );
  });
});

describe("hashesEqual", () => {
  it("accepts equal hex strings", () => {
    assert.equal(hashesEqual("deadbeef", "deadbeef"), true);
  });

  it("rejects different hex strings", () => {
    assert.equal(hashesEqual("deadbeef", "deadbeee"), false);
  });

  it("rejects strings of different length", () => {
    assert.equal(hashesEqual("deadbeef", "deadbeef00"), false);
  });
});

describe("validateTelegramInitData", () => {
  it("accepts a correctly signed, fresh payload", () => {
    const result = validateTelegramInitData(signedInitData(), BOT_TOKEN, NOW);
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.user.telegramId, 42);
    assert.equal(result.user.firstName, "Ada");
    assert.equal(result.user.lastName, "Lovelace");
    assert.equal(result.user.username, "ada");
    assert.equal(result.user.languageCode, "en");
    assert.equal(result.user.photoUrl, "https://example.com/ada.png");
    assert.equal(result.user.authDate, NOW);
  });

  it("accepts a payload without optional user fields", () => {
    const initData = signedInitData({
      user: JSON.stringify({id: 7, first_name: "Solo"}),
    });
    const result = validateTelegramInitData(initData, BOT_TOKEN, NOW);
    assert.ok(result.ok);
    assert.equal(result.user.lastName, null);
    assert.equal(result.user.username, null);
    assert.equal(result.user.languageCode, null);
    assert.equal(result.user.photoUrl, null);
  });

  it("rejects a missing bot token", () => {
    const result = validateTelegramInitData(signedInitData(), "", NOW);
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.equal(result.reason, "missing-bot-token");
  });

  it("rejects malformed data", () => {
    const result = validateTelegramInitData("not-init-data", BOT_TOKEN, NOW);
    assert.ok(!result.ok);
    assert.equal(result.reason, "malformed-init-data");
  });

  it("rejects a payload signed with a different token", () => {
    const initData = signedInitData();
    const result = validateTelegramInitData(initData, "999:OTHER", NOW);
    assert.ok(!result.ok);
    assert.equal(result.reason, "invalid-signature");
  });

  it("rejects a tampered payload", () => {
    const params = new URLSearchParams(signedInitData());
    params.set("user", (params.get("user") ?? "").replace("Ada", "Eve"));
    const result = validateTelegramInitData(params.toString(), BOT_TOKEN, NOW);
    assert.ok(!result.ok);
    assert.equal(result.reason, "invalid-signature");
  });

  it("rejects stale auth_date", () => {
    const stale = signedInitData({
      auth_date: String(NOW - MAX_AUTH_AGE_SECONDS - 1),
    });
    const result = validateTelegramInitData(stale, BOT_TOKEN, NOW);
    assert.ok(!result.ok);
    assert.equal(result.reason, "expired-auth-date");
  });

  it("rejects a non-numeric auth_date", () => {
    const bad = signedInitData({auth_date: "abc"});
    const result = validateTelegramInitData(bad, BOT_TOKEN, NOW);
    assert.ok(!result.ok);
    assert.equal(result.reason, "invalid-auth-date");
  });

  it("rejects a user field that is not JSON", () => {
    const bad = signedInitData({user: "not-json"});
    const result = validateTelegramInitData(bad, BOT_TOKEN, NOW);
    assert.ok(!result.ok);
    assert.equal(result.reason, "invalid-user-json");
  });

  it("rejects a user without an id", () => {
    const bad = signedInitData({
      user: JSON.stringify({first_name: "Ada"}),
    });
    const result = validateTelegramInitData(bad, BOT_TOKEN, NOW);
    assert.ok(!result.ok);
    assert.equal(result.reason, "invalid-user-id");
  });

  it("rejects a user without a first name", () => {
    const bad = signedInitData({user: JSON.stringify({id: 5})});
    const result = validateTelegramInitData(bad, BOT_TOKEN, NOW);
    assert.ok(!result.ok);
    assert.equal(result.reason, "invalid-first-name");
  });
});

describe("buildTelegramUid", () => {
  it("prefixes the Telegram id with tg-", () => {
    assert.equal(buildTelegramUid(12345), "tg-12345");
  });
});

describe("parseAdminTelegramIds", () => {
  it("returns an empty set when unset", () => {
    assert.equal(parseAdminTelegramIds(undefined).size, 0);
    assert.equal(parseAdminTelegramIds("").size, 0);
  });

  it("parses a comma-separated list and tolerates whitespace", () => {
    const ids = parseAdminTelegramIds("1, 2 ,3");
    assert.deepEqual([...ids].sort((a, b) => a - b), [1, 2, 3]);
  });

  it("drops zero, negatives and non-numeric entries", () => {
    assert.equal(parseAdminTelegramIds("0,-5,abc").size, 0);
  });
});

describe("resolveUserRole", () => {
  it("grants admin to whitelisted ids", () => {
    assert.equal(resolveUserRole(2, new Set([2])), "admin");
  });

  it("defaults everyone else to user", () => {
    assert.equal(resolveUserRole(3, new Set([2])), "user");
  });
});

describe("resolveDevTelegramUser", () => {
  it("is disabled outside the emulator", () => {
    assert.equal(resolveDevTelegramUser(5, false), null);
  });

  it("synthesises a dev user inside the emulator", () => {
    const user = resolveDevTelegramUser(5, true);
    assert.ok(user);
    assert.equal(user.telegramId, 5);
    assert.equal(user.username, "dev_5");
    assert.equal(user.firstName, "Dev");
  });

  it("rejects invalid ids even inside the emulator", () => {
    assert.equal(resolveDevTelegramUser("nope", true), null);
    assert.equal(resolveDevTelegramUser(0, true), null);
    assert.equal(resolveDevTelegramUser(-1, true), null);
  });
});
