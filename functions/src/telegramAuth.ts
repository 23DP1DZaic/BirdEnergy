/**
 * AUTH-02: Server-side validation of Telegram Mini App initData.
 *
 * Pure, dependency-free (Node crypto only) so it can be unit-tested
 * without emulator setup (see TEST-02).
 *
 * Algorithm per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app:
 *   1. secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
 *   2. data_check_string = all initData fields except `hash`, sorted by key,
 *      joined as "key=value" lines with "\n"
 *   3. hash = hex(HMAC_SHA256(key=secret_key, data=data_check_string))
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Freshness window for initData `auth_date`. 24h covers timezone/clock drift
 *  on clients; Telegram docs recommend rejecting stale data. */
export const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

export interface TelegramAuthUser {
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  languageCode: string | null;
  /** Parsed `auth_date` (unix seconds) of the validated initData. */
  authDate: number;
}

export type TelegramAuthResult =
  | { ok: true; user: TelegramAuthUser }
  | { ok: false; reason: string };

/** Parses "a=1&b=hello%20world" into a record. Returns null if malformed. */
export function parseInitData(initData: string): Record<string, string> | null {
  if (typeof initData !== "string" || initData.length === 0) return null;
  if (initData.length > 4096) return null; // hard cap against absurd payloads

  const params = new URLSearchParams(initData);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key.length === 0 || result[key] !== undefined) return null; // dup/malformed key
    result[key] = value;
  }
  if (result.hash === undefined || result.user === undefined) return null;
  return result;
}

/** Builds the data_check_string: every field except `hash`, sorted, "key=value\n". */
export function buildDataCheckString(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("\n");
}

/** Computes the expected hex hash for given params + bot token. */
export function computeExpectedHash(
  params: Record<string, string>,
  botToken: string,
): string {
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const dataCheckString = buildDataCheckString(params);
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

/** Constant-time hex string comparison. */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Validates Telegram Mini App initData against the bot token.
 * Rejects: missing/malformed data, missing user/hash, bad signature,
 * and stale auth_date (older than MAX_AUTH_AGE_SECONDS).
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): TelegramAuthResult {
  if (!botToken) return { ok: false, reason: "missing-bot-token" };

  const params = parseInitData(initData);
  if (!params) return { ok: false, reason: "malformed-init-data" };

  const expectedHash = computeExpectedHash(params, botToken);
  if (!hashesEqual(expectedHash, params.hash)) {
    return { ok: false, reason: "invalid-signature" };
  }

  const authDate = Number.parseInt(params.auth_date ?? "", 10);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, reason: "invalid-auth-date" };
  }
  if (nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) {
    return { ok: false, reason: "expired-auth-date" };
  }

  let rawUser: unknown;
  try {
    rawUser = JSON.parse(params.user);
  } catch {
    return { ok: false, reason: "invalid-user-json" };
  }

  const user = rawUser as Record<string, unknown> | null;
  const telegramId =
    typeof user?.id === "number" ? user.id : Number(user?.id);
  if (!Number.isInteger(telegramId) || telegramId <= 0) {
    return { ok: false, reason: "invalid-user-id" };
  }
  if (typeof user?.first_name !== "string" || user.first_name.length === 0) {
    return { ok: false, reason: "invalid-first-name" };
  }

  return {
    ok: true,
    user: {
      telegramId,
      firstName: user.first_name,
      lastName: typeof user.last_name === "string" ? user.last_name : null,
      username: typeof user.username === "string" ? user.username : null,
      languageCode:
        typeof user.language_code === "string" ? user.language_code : null,
      authDate,
    },
  };
}

// ---------------------------------------------------------------- AUTH-03 ---

export type UserRole = "user" | "admin";

/**
 * Deterministic Firebase Auth uid derived from the (server-validated)
 * Telegram id. Only chars [A-Za-z0-9-] — safe for createCustomToken().
 */
export function buildTelegramUid(telegramId: number): string {
  return `tg-${telegramId}`;
}

/**
 * Parses the ADMIN_TELEGRAM_IDS env var: comma-separated Telegram user ids.
 * Tolerates whitespace and silently drops garbage entries.
 */
export function parseAdminTelegramIds(envValue: string | undefined): Set<number> {
  const ids = new Set<number>();
  if (!envValue) return ids;
  for (const part of envValue.split(",")) {
    const id = Number.parseInt(part.trim(), 10);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return ids;
}

/** Role resolution happens ONLY here, server-side, from the whitelist. */
export function resolveUserRole(
  telegramId: number,
  adminTelegramIds: Set<number>,
): UserRole {
  return adminTelegramIds.has(telegramId) ? "admin" : "user";
}

// ------------------------------------------------------------------ DEV-ONLY ---

/**
 * DEV-ONLY: synthetic Telegram user for running the Mini App in a plain
 * browser, where no signed initData exists (see src/devAuth.ts on the client).
 *
 * `isEmulator` must be true — firebase-tools sets FUNCTIONS_EMULATOR=true for
 * locally served functions — so a deployed function can never be tricked into
 * trusting a raw client-supplied id. Returns null for anything else, which
 * makes authenticateTelegram fall back to normal initData validation.
 *
 * The role is still resolved from ADMIN_TELEGRAM_IDS, so adding your own id
 * to functions/.env also gives you the admin UI during local development.
 */
export function resolveDevTelegramUser(
  devTelegramId: unknown,
  isEmulator: boolean,
): TelegramAuthUser | null {
  if (!isEmulator) return null;

  const telegramId =
    typeof devTelegramId === "number" ? devTelegramId : Number(devTelegramId);
  if (!Number.isInteger(telegramId) || telegramId <= 0) return null;

  return {
    telegramId,
    firstName: "Dev",
    lastName: null,
    username: `dev_${telegramId}`,
    languageCode: "en",
    authDate: Math.floor(Date.now() / 1000),
  };
}
