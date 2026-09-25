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
import {FieldValue, getFirestore} from "firebase-admin/firestore";
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

// ------------------------------------------------------------------- DATA-01 ---

/**
 * DATA-01 — persist one finished run.
 *
 * Accepts {score, durationMs, jumpCount}; the caller's identity comes ONLY
 * from the Firebase ID token (request.auth) — never from client input.
 * Validates ranges server-side (the client is untrusted), writes one
 * gameResults document and updates the users/{uid} aggregates
 * (bestScore, totalGames, totalScore) in the same transaction.
 *
 * Reuses the authenticateTelegram CORS origins + europe-north1 region; the
 * caller must be signed in (Firebase ID token) AND have accepted data
 * processing (the users/{uid} doc must exist — created by the consent flow).
 */
interface SubmitGameResultData {
  score?: unknown;
  durationMs?: unknown;
  jumpCount?: unknown;
}

/** Server-side range validation — the client is never trusted (card DoD). */
function validateRunData(data: SubmitGameResultData): {
  score: number;
  durationMs: number;
  jumpCount: number;
} {
  const score = data.score;
  if (typeof score !== "number" || !Number.isInteger(score) ||
      score < 0 || score > 10_000) {
    throw new HttpsError("invalid-argument",
      "score must be an integer between 0 and 10000.");
  }

  const durationMs = data.durationMs;
  if (typeof durationMs !== "number" || !Number.isInteger(durationMs) ||
      durationMs < 0 || durationMs > 6 * 60 * 60 * 1000) {
    throw new HttpsError("invalid-argument",
      "durationMs must be an integer between 0 and 21600000.");
  }

  const jumpCount = data.jumpCount;
  if (typeof jumpCount !== "number" || !Number.isInteger(jumpCount) ||
      jumpCount < 0 || jumpCount > 10_000) {
    throw new HttpsError("invalid-argument",
      "jumpCount must be an integer between 0 and 10000.");
  }

  return {score, durationMs, jumpCount};
}

export const submitGameResult = onCall(
  {
    region: "europe-north1",
    cors: [
      "https://birdenergy-f1405.web.app",
      "https://birdenergy-f1405.firebaseapp.com",
    ],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to submit results.");
    }

    const run = validateRunData((request.data ?? {}) as SubmitGameResultData);
    const uid = request.auth.uid;
    const db = getFirestore();
    const userDoc = db.collection("users").doc(uid);
    const now = new Date();

    try {
      const aggregates = await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userDoc);
        if (!userSnap.exists) {
          throw new HttpsError("failed-precondition",
            "No player profile — accept data processing first.");
        }

        const prev = userSnap.data() ?? {};
        const prevBest = typeof prev.bestScore === "number" ? prev.bestScore : 0;
        const newBest = run.score > prevBest;

        // One attempt document per finished run (never updated afterwards).
        const resultRef = db.collection("gameResults").doc();
        tx.set(resultRef, {
          uid,
          score: run.score,
          durationMs: run.durationMs,
          jumpCount: run.jumpCount,
          createdAt: now,
        });

        tx.update(userDoc, {
          bestScore: newBest ? run.score : prevBest,
          totalGames: FieldValue.increment(1),
          totalScore: FieldValue.increment(run.score),
          lastPlayedAt: now,
        });

        return {
          bestScore: newBest ? run.score : prevBest,
          totalGames: (typeof prev.totalGames === "number" ? prev.totalGames : 0) + 1,
          totalScore: (typeof prev.totalScore === "number" ? prev.totalScore : 0) +
            run.score,
          newBest,
        };
      });

      logger.info("Game result submitted", {uid, ...run, newBest: aggregates.newBest});
      return aggregates;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("submitGameResult failed", error);
      throw new HttpsError("internal", "Could not save the result.");
    }
  },
);
