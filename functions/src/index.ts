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
 * LOCAL DEV: when served by the Functions emulator, the client may send a bare
 * `devTelegramId` (from VITE_TELEGRAM_ID) instead of initData — see
 * resolveDevTelegramUser(). That field is ignored by deployed functions.
 *
 * Upgrade path: defineSecret() + Secret Manager for the bot token.
 */

import {setGlobalOptions} from "firebase-functions";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {
  buildTelegramUid,
  parseAdminTelegramIds,
  resolveDevTelegramUser,
  resolveUserRole,
  validateTelegramInitData,
  type TelegramAuthUser,
} from "./telegramAuth.js";

setGlobalOptions({maxInstances: 10, region: "europe-north1"});

// Required by firebase-admin Auth for custom token minting.
initializeApp();

/** Payload accepted from the client (see src/auth.ts). */
interface AuthenticateTelegramData {
  /** Signed Telegram Mini App initData — the only trusted source in production. */
  initData?: unknown;
  /** DATA-01: when true, create/update the users/{uid} consent profile. */
  acceptDataProcessing?: unknown;
  /** DEV-ONLY (src/devAuth.ts): raw Telegram id, honored by the emulator only. */
  devTelegramId?: unknown;
}

/** True only while firebase-tools serves this code locally. */
function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

/**
 * Resolves the caller's verified Telegram identity: dev bypass first (emulator
 * only), otherwise HMAC validation of initData. Throws HttpsError on rejection.
 */
function resolveRequestUser(data: AuthenticateTelegramData): TelegramAuthUser {
  const devUser = resolveDevTelegramUser(data.devTelegramId, isEmulator());
  if (devUser) {
    logger.warn("DEV login bypass used (emulator only)", {
      telegramId: devUser.telegramId,
    });
    return devUser;
  }

  const {initData} = data;
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

  return result.user;
}

export const authenticateTelegram = onCall(
  {
    region: "europe-north1",
    cors: [
      "https://birdenergy-f1405.web.app",
      "https://birdenergy-f1405.firebaseapp.com",
    ],
    // The callable protocol does its own auth (Firebase ID token -> request.auth);
    // this only lets anonymous HTTPS reach Cloud Run so that check can run.
    invoker: "public",
  }, 
  async (request) => {
    const data = (request.data ?? {}) as AuthenticateTelegramData;

    const {telegramId, username, firstName, lastName, languageCode, authDate} =
      resolveRequestUser(data);

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

      // DATA-01: create the users/{uid} profile when the user consents to data
      // processing (leaderboard name + scores). The consent flag is trusted only
      // after identity resolution above; the write is idempotent and preserves
      // any existing game data (bestScore/totals) on re-consent. Server-side via
      // the Admin SDK, so firestore.rules can keep users/ read+write=owner-only
      // while still allowing the public leaderboard reads (SEC-01).
      if (data.acceptDataProcessing === true) {
        try {
          const db = getFirestore();
          const userDoc = db.collection("users").doc(uid);
          await db.runTransaction(async (tx) => {
            const existing = await tx.get(userDoc);
            if (existing.exists) {
              tx.update(userDoc, {
                acceptedDataProcessingAt: new Date(),
                telegramId,
                username,
                firstName,
                lastName,
                languageCode,
              });
            } else {
              tx.set(userDoc, {
                uid,
                telegramId,
                username,
                firstName,
                lastName,
                languageCode,
                role,
                bestScore: 0,
                gamesPlayed: 0,
                acceptedDataProcessingAt: new Date(),
                createdAt: new Date(),
              });
            }
          });
          logger.info("users/ profile ensured", {uid, telegramId, role});
        } catch (dbError) {
          // Consent profile write failing must not block sign-in/gameplay;
          // the client surfaces the error when it reads the profile instead.
          logger.error("users/ profile write failed", dbError);
        }
      }

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

/**
 * DATA-01 — explicit consent step for the data used by the game/leaderboard.
 *
 * Called by the consent dialog when the user accepts. Runs against the live
 * Firebase session (request.auth), so it works even when initData has expired
 * (Telegram initData is only fresh for 24h — the session lasts far longer).
 * The caller's identity comes from the Auth session only: there is no
 * client-supplied id to trust. Same idempotent upsert as in
 * authenticateTelegram, preserving existing bestScore/gamesPlayed.
 */
interface AcceptDataProcessingResult {
  ok: boolean;
}

export const acceptDataProcessing = onCall(
  {
    region: "europe-north1",
    cors: [
      "https://birdenergy-f1405.web.app",
      "https://birdenergy-f1405.firebaseapp.com",
    ],    // Auth is enforced in-code (request.auth) — see acceptDataProcessing below.
    invoker: "public",
  },
  async (request): Promise<AcceptDataProcessingResult> => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in first — consent is bound to your Telegram account.",
      );
    }

    const uid = request.auth.uid;
    // buildTelegramUid() is `tg-<id>`; the claim carries the numeric id too.
    const claimedId = request.auth.token.telegramId;
    const telegramId =
      typeof claimedId === "number"
        ? claimedId
        : Number.parseInt(uid.replace(/^tg-/, ""), 10);
    if (!Number.isInteger(telegramId) || telegramId <= 0) {
      logger.error("Cannot resolve telegramId for consent", {uid});
      throw new HttpsError(
        "failed-precondition",
        "Session is not linked to a Telegram account.",
      );
    }

    try {
      const db = getFirestore();
      const userDoc = db.collection("users").doc(uid);
      await db.runTransaction(async (tx) => {
        const existing = await tx.get(userDoc);
        if (existing.exists) {
          tx.update(userDoc, {acceptedDataProcessingAt: new Date()});
        } else {
          tx.set(userDoc, {
            uid,
            telegramId,
            // Auth record fields as a best-effort profile; the next
            // authenticateTelegram call refreshes username/firstName etc.
            username: null,
            firstName: (request.auth?.token.name as string | undefined) ?? "Player",
            lastName: null,
            languageCode: null,
            role: request.auth?.token.role ?? "user",
            bestScore: 0,
            gamesPlayed: 0,
            acceptedDataProcessingAt: new Date(),
            createdAt: new Date(),
          });
        }
      });
      logger.info("Data-processing consent accepted", {uid, telegramId});
      return {ok: true};
    } catch (error) {
      logger.error("Consent write failed", error);
      throw new HttpsError("internal", "Could not save consent.");
    }
  },
);
