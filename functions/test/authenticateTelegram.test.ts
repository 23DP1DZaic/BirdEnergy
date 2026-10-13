/**
 * AUTH-02 / AUTH-03 — behaviour tests for authenticateTelegram.
 *
 * The handler is driven with a real, correctly HMAC-signed initData string, so
 * the signature check runs for real. Auth and Firestore are stubbed: the tests
 * assert that the role is resolved server-side and that the consent profile is
 * only written when asked for.
 */
import "./setup.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { authenticateTelegram } from "../src/index.js";
import { computeExpectedHash } from "../src/telegramAuth.js";
import { errorCode, wrapCallable } from "./helpers/callables.js";
import { installFakeAuth } from "./helpers/fakeAuth.js";
import { installFakeFirestore } from "./helpers/fakeFirestore.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

interface AuthResult {
  ok: boolean;
  customToken: string;
  role: string;
  user: { telegramId: number; username: string | null; firstName: string };
}

const invoke = wrapCallable<AuthResult>(authenticateTelegram);

let auth: ReturnType<typeof installFakeAuth>;
let db: ReturnType<typeof installFakeFirestore>;
beforeEach(() => {
  auth = installFakeAuth();
  db = installFakeFirestore();
});

/** Builds a correctly signed initData string, as Telegram would send it. */
function signedInitData(
  user: Record<string, unknown>,
  authDate = Math.floor(Date.now() / 1000),
): string {
  const params: Record<string, string> = {
    auth_date: String(authDate),
    query_id: "AAA-1",
    user: JSON.stringify(user),
  };
  const hash = computeExpectedHash(params, BOT_TOKEN);
  return new URLSearchParams({...params, hash}).toString();
}

const ADMIN_USER = {id: 999999999, first_name: "Admin", username: "boss"};
const NORMAL_USER = {id: 111111111, first_name: "Ada", username: "ada"};

describe("authenticateTelegram — invalid input", () => {
  it("rejects a request without initData", async () => {
    assert.equal(await errorCode(invoke({data: {}})), "invalid-argument");
  });

  it("rejects a non-string initData", async () => {
    assert.equal(
      await errorCode(invoke({data: {initData: 123}})),
      "invalid-argument",
    );
  });

  it("ignores a client-supplied devTelegramId outside the emulator", async () => {
    assert.equal(
      await errorCode(invoke({data: {devTelegramId: 999999999}})),
      "invalid-argument",
    );
  });

  it("rejects initData with a bad signature", async () => {
    const initData = "auth_date=1700000000&query_id=AAA&user=%7B%22id%22%3A1%7D&hash=deadbeef";
    assert.equal(
      await errorCode(invoke({data: {initData}})),
      "unauthenticated",
    );
  });

  it("fails when the server has no bot token configured", async () => {
    const saved = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      assert.equal(
        await errorCode(invoke({data: {initData: signedInitData(ADMIN_USER)}})),
        "failed-precondition",
      );
    } finally {
      process.env.TELEGRAM_BOT_TOKEN = saved;
    }
  });
});

describe("authenticateTelegram — valid input", () => {
  it("resolves the admin role from the whitelist and mints a session", async () => {
    const result = await invoke({
      data: {initData: signedInitData(ADMIN_USER)},
    });

    assert.equal(result.ok, true);
    assert.equal(result.role, "admin");
    assert.equal(result.customToken, "custom-tg-999999999");
    assert.equal(result.user.telegramId, 999999999);
    assert.equal(result.user.firstName, "Admin");
    assert.equal(result.user.username, "boss");

    assert.deepEqual(auth.claims.get("tg-999999999"), {
      role: "admin",
      telegramId: 999999999,
    });
  });

  it("defaults everyone else to the user role", async () => {
    const result = await invoke({
      data: {initData: signedInitData(NORMAL_USER)},
    });

    assert.equal(result.role, "user");
    assert.equal(result.customToken, "custom-tg-111111111");
    assert.deepEqual(auth.claims.get("tg-111111111"), {
      role: "user",
      telegramId: 111111111,
    });
  });

  it("creates the Auth user before setting claims", async () => {
    await invoke({data: {initData: signedInitData(NORMAL_USER)}});
    assert.equal(auth.created.length, 1);
    assert.equal(auth.created[0].uid, "tg-111111111");
    assert.equal(auth.created[0].displayName, "Ada");
  });

  it("only writes the profile when consent is accepted", async () => {
    await invoke({data: {initData: signedInitData(NORMAL_USER)}});
    assert.equal(db.rows("users").length, 0);

    await invoke({
      data: {initData: signedInitData(NORMAL_USER), acceptDataProcessing: true},
    });
    const profile = db.peek("users", "tg-111111111");
    assert.ok(profile);
    assert.equal(profile.role, "user");
    assert.equal(profile.bestScore, 0);
  });

  it("accepts the dev bypass only inside the emulator", async () => {
    const saved = process.env.FUNCTIONS_EMULATOR;
    process.env.FUNCTIONS_EMULATOR = "true";
    try {
      const result = await invoke({data: {devTelegramId: 111111111}});
      assert.equal(result.ok, true);
      assert.equal(result.role, "user");
      assert.equal(result.user.telegramId, 111111111);
      assert.equal(result.user.username, "dev_111111111");
    } finally {
      if (saved === undefined) delete process.env.FUNCTIONS_EMULATOR;
      else process.env.FUNCTIONS_EMULATOR = saved;
    }
  });
});
