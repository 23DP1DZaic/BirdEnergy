/**
 * Cloud Functions — BirdEnergy (Flappy Arena)
 *
 * AUTH-02: authenticateTelegram — validates Telegram Mini App initData
 * server-side (HMAC-SHA256 signature + auth_date freshness).
 *
 * AUTH-03: after validation, mints a Firebase custom token so the client
 * can sign in via signInWithCustomToken. The role (user/admin) is resolved
 * ONLY here, server-side, from the ADMIN_TELEGRAM_IDS whitelist, and is
 * embedded both as custom user claims (persists across refreshes) and in
 * the custom token payload (effective on the first sign-in immediately).
 *
 * Env vars (functions/.env, gitignored):
 *   - TELEGRAM_BOT_TOKEN: BotFather token used to verify initData HMAC.
 *   - ADMIN_TELEGRAM_IDS: comma-separated Telegram ids granted "admin".
 *
 * Upgrade path: defineSecret() + Secret Manager for the bot token.
 */

import {setGlobalOptions} from "firebase-functions";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {logger} from "firebase-functions";
import {
  buildTelegramUid,
  parseAdminTelegramIds,
  resolveUserRole,
  validateTelegramInitData,
} from "./telegramAuth.js";

setGlobalOptions({maxInstances: 10, region: "europe-north1"});

// Required by firebase-admin Auth for custom token minting.
initializeApp();

export const authenticateTelegram = onCall(async (request) => {
  const initData = request.data?.initData;
  if (typeof initData !== "string" || initData.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "Missing initData string.",
    );
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.error("TELEGRAM_BOT_TOKEN is not configured.");
    throw new HttpsError(
      "failed-precondition",
      "Server authentication is not configured.",
    );
  }

  const result = validateTelegramInitData(initData, botToken);
  if (!result.ok) {
    logger.warn("initData validation failed", {reason: result.reason});
    throw new HttpsError(
      "unauthenticated",
      "Telegram data validation failed.",
    );
  }

  const {telegramId, username, firstName, lastName, languageCode, authDate} =
    result.user;

  // AUTH-03: role from server-side whitelist — never from client input.
  const adminIds = parseAdminTelegramIds(process.env.ADMIN_TELEGRAM_IDS);
  const role = resolveUserRole(telegramId, adminIds);
  const uid = buildTelegramUid(telegramId);

  try {
    const auth = getAuth();

    // Ensure the Auth user exists before setting claims / minting a token.
    await auth.getUser(uid).catch(async (error: unknown) => {
      const code = (error as {code?: string}).code;
      if (code !== "auth/user-not-found") throw error;
      await auth.createUser({
        uid,
        displayName: [firstName, lastName].filter(Boolean).join(" ") ||
          undefined,
        // Reserved: the users/{uid} Firestore doc (DATA-01) stores the
        // structured profile; Auth record only carries display basics.
      });
      logger.info("Created Firebase Auth user", {uid, telegramId, role});
    });

    // Persist role as custom claims so Firestore rules can check
    // request.auth.token.role, and so it survives token refreshes.
    await auth.setCustomUserClaims(uid, {role, telegramId});

    // Claims passed here are effective immediately on first sign-in.
    const customToken = await auth.createCustomToken(uid, {
      role,
      telegramId,
    });

    logger.info("Telegram user authenticated", {telegramId, username, role});

    return {
      ok: true,
      customToken,
      role,
      user: {
        telegramId,
        username,
        firstName,
        lastName,
        languageCode,
        authDate,
      },
    };
  } catch (error) {
    logger.error("Custom token minting failed", error);
    throw new HttpsError(
      "internal",
      "Failed to create authentication session.",
    );
  }
});
