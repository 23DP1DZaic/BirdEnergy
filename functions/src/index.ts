/**
 * Cloud Functions — BirdEnergy (Flappy Arena)
 *
 * AUTH-02: authenticateTelegram — validates Telegram Mini App initData
 * server-side (HMAC-SHA256 signature + auth_date freshness) and returns
 * the authenticated user identity (telegramId, username, firstName).
 *
 * The bot token is read from the TELEGRAM_BOT_TOKEN environment variable,
 * provided via functions/.env (gitignored). Upgrade path: defineSecret()
 * + Secret Manager if stronger protection is required.
 */

import {setGlobalOptions} from "firebase-functions";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {initializeApp} from "firebase-admin/app";
import {logger} from "firebase-functions";
import {validateTelegramInitData} from "./telegramAuth.js";

setGlobalOptions({maxInstances: 10, region: "europe-north1"});

// Needed by subsequent auth steps (AUTH-03: custom token minting).
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
  logger.info("Telegram user authenticated", {telegramId, username});

  return {
    ok: true,
    user: {telegramId, username, firstName, lastName, languageCode, authDate},
  };
});
