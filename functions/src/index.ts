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
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {initializeApp} from "firebase-admin/app";
import {bot} from "./botcommand.js";
import {getAuth} from "firebase-admin/auth";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_TYPES,
  lookupTierReward,
  type ChallengeDifficulty,
  type EconomyChallengeType,
} from "./economy.js";
import {
  buildTelegramUid, 
  parseAdminTelegramIds,
  resolveDevTelegramUser,
  resolveUserRole,
  validateTelegramInitData,
  type TelegramAuthUser,
} from "./telegramAuth.js";
import {initializeEconomy} from "./economyInit.js";

setGlobalOptions({maxInstances: 10, region: "europe-north1"});

// Required by firebase-admin Auth for custom token minting.
initializeApp();


export const telegramWebhook = onRequest(
  {
    region: "europe-north1",
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      await bot.handleUpdate(req.body);
      res.status(200).send("OK");
    } catch (error) {
      logger.error("Telegram webhook error", error);
      res.status(500).send("Internal Server Error");
    }
  }
);
/** Payload accepted from the client (see src/auth.ts). */
interface AuthenticateTelegramData {
  /** Signed Telegram Mini App initData — the only trusted source in production. */
  initData?: unknown;
  /** DATA-01: when true, create/update the users/{uid} consent profile. */
  acceptDataProcessing?: unknown;
  /** DEV-ONLY (src/devAuth.ts): raw Telegram id, honored by the emulator only. */
  devTelegramId?: unknown;
}

/** Same CORS origins for every callable — the two Firebase Hosting domains. */
const CALLABLE_CORS = [
  "https://birdenergy-f1405.web.app",
  "https://birdenergy-f1405.firebaseapp.com",
];

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
    cors: CALLABLE_CORS,
    // The callable protocol does its own auth (Firebase ID token -> request.auth);
    // this only lets anonymous HTTPS reach Cloud Run so that check can run.
    invoker: "public",
  }, 
  async (request) => {
    const data = (request.data ?? {}) as AuthenticateTelegramData;

    const {telegramId, username, firstName, lastName, languageCode, photoUrl,
      authDate} = resolveRequestUser(data);

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
                photoUrl,
              });
            } else {
              tx.set(userDoc, {
                uid,
                telegramId,
                username,
                firstName,
                lastName,
                languageCode,
                photoUrl,
                role,
                bestScore: 0,
                // submitGameResult increments totalGames/totalScore — the
                // aggregates must start under the SAME names (was gamesPlayed,
                // which the submit path never touches).
                totalGames: 0,
                totalScore: 0,
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

        // ECON-01: backfill the economy fields (coins/ownership/version) now
        // that the profile exists — own transaction, run AFTER the consent
        // upsert above (Firestore transactions read before they write). A
        // failure must not block sign-in either: the next login retries.
        try {
          await initializeEconomy(getFirestore(), uid);
        } catch (economyError) {
          logger.error("Economy initialization failed", economyError);
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
          photoUrl,
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
 * authenticateTelegram, preserving existing bestScore/totals.
 */
interface AcceptDataProcessingResult {
  ok: boolean;
}

export const acceptDataProcessing = onCall(
  {
    region: "europe-north1",
    cors: CALLABLE_CORS,
    // Auth is enforced in-code (request.auth) — see acceptDataProcessing below.
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
          tx.update(userDoc, {
            acceptedDataProcessingAt: new Date(),
          });
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
            // Best-effort profile from the Auth session; the next
            // authenticateTelegram call refreshes photoUrl/firstName etc.
            photoUrl: null,
            role: request.auth?.token.role ?? "user",
            bestScore: 0,
            // Same aggregate names as submitGameResult increments (the old
            // `gamesPlayed` field was never touched by the submit path).
            totalGames: 0,
            totalScore: 0,
            acceptedDataProcessingAt: new Date(),
            createdAt: new Date(),
          });
        }
      });
      logger.info("Data-processing consent accepted", {uid, telegramId});
      // ECON-01: backfill the economy fields on the profile (own transaction,
      // after the consent upsert above; best-effort — consent already saved,
      // so an economy failure is logged and retried on the next sign-in).
      try {
        await initializeEconomy(db, uid);
      } catch (economyError) {
        logger.error("Economy initialization failed", economyError);
      }
      return {ok: true};
    } catch (error) {
      logger.error("Consent write failed", error);
      throw new HttpsError("internal", "Could not save consent.");
    }
  },
);

// ------------------------------------------------------------------- UI-04 ----

/**
 * UI-04 — in-game display name ("in-game username").
 *
 * The Profile screen lets the player pick a display name shown on the
 * leaderboard, independent of the immutable Telegram @username (stored as
 * `username`) and of Telegram's first_name. Identity stays server-bound:
 * the caller's uid comes from request.auth, and the write lands only on the
 * caller's own users/{uid} doc — Firestore rules (SEC-01) allow no client
 * writes, so this callable is the only path.
 */
interface UpdateProfileResult {
  ok: boolean;
  inGameName: string;
}

/** Payload accepted by updateProfile — every field optional, at least one
 *  required (the Profile screen sends only what changed). */
interface UpdateProfileData {
  /** In-game display name (3-20 chars of [A-Za-z0-9_]). */
  username?: unknown;
  /** UI-04 appearance preferences — indices into the client asset lists
 *   (bird skins, skies, ground strips); validated to sane ranges here. */
  preferredBird?: unknown;
  preferredBackground?: unknown;
  preferredGround?: unknown;
}

/** In-game name rules, shared by the client validator (mirrored in src). */
export const IN_GAME_NAME_MIN = 3;
export const IN_GAME_NAME_MAX = 20;
const IN_GAME_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

/** Appearance preference ranges — must cover the client asset lists
 *  (10 bird skins, 9 skies, 2 grounds) without being unbounded. */
const PREFERRED_BIRD_MAX = 99;
const PREFERRED_BACKGROUND_MAX = 99;
const PREFERRED_GROUND_MAX = 99;

/** Validates a preference index: a non-negative integer within the range.
 *  Missing/undefined fields are skipped by the caller before this runs. */
function validatePreference(
  value: unknown,
  max: number,
  field: string,
): number {
  if (!Number.isInteger(value) || (value as number) < 0 ||
      (value as number) > max) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be an integer between 0 and ${max}.`,
    );
  }
  return value as number;
}

/**
 * True when `name` is a valid in-game name: trimmed, 3–20 chars,
 * letters/digits/underscore only.
 */
export function isValidInGameName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return (
    trimmed.length >= IN_GAME_NAME_MIN &&
    trimmed.length <= IN_GAME_NAME_MAX &&
    IN_GAME_NAME_PATTERN.test(trimmed)
  );
}

export const updateProfile = onCall(
  {
    region: "europe-north1",
    cors: CALLABLE_CORS,
    invoker: ["public"],
  },
  async (request): Promise<UpdateProfileResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to change your profile.");
    }

    const data = (request.data ?? {}) as UpdateProfileData;
    const uid = request.auth.uid;
    const db = getFirestore();

    // --- name (optional): same rules as before, uniqueness best-effort ---
    let inGameName: string | null = null;
    if (data.username !== undefined) {
      if (!isValidInGameName(data.username)) {
        throw new HttpsError(
          "invalid-argument",
          `username must be ${IN_GAME_NAME_MIN}-${IN_GAME_NAME_MAX} characters (letters, digits, underscore).`,
        );
      }
      inGameName = data.username.trim();
    }

    // --- appearance preferences (optional, range-validated) ---
    const patch: Record<string, number | string | Date> = {};
    if (inGameName !== null) {
      patch.inGameName = inGameName;
      patch.inGameNameUpdatedAt = new Date();
    }
    if (data.preferredBird !== undefined) {
      patch.preferredBird = validatePreference(
        data.preferredBird, PREFERRED_BIRD_MAX, "preferredBird");
    }
    if (data.preferredBackground !== undefined) {
      patch.preferredBackground = validatePreference(
        data.preferredBackground, PREFERRED_BACKGROUND_MAX,
        "preferredBackground");
    }
    if (data.preferredGround !== undefined) {
      patch.preferredGround = validatePreference(
        data.preferredGround, PREFERRED_GROUND_MAX, "preferredGround");
    }
    if (Object.keys(patch).length === 0) {
      throw new HttpsError("invalid-argument", "Nothing to update.");
    }

    try {
      if (inGameName !== null) {
        // Uniqueness is best-effort: a doc written right after the query would
        // slip through (no composite index/tx across two docs by design).
        const clash = await db
          .collection("users")
          .where("inGameName", "==", inGameName)
          .limit(1)
          .get();
        const takenBySomeoneElse = !clash.empty && clash.docs[0].id !== uid;
        if (takenBySomeoneElse) {
          throw new HttpsError("already-exists", "That name is already taken.");
        }
      }

      // The caller's profile must exist (consent created it) — same
      // precondition as submitGameResult.
      const userDoc = db.collection("users").doc(uid);
      let effectiveName = "";
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(userDoc);
        if (!snap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "No player profile — accept data processing first.",
          );
        }
        const current = snap.data()?.inGameName;
        // Respond with the effective name (unchanged when only prefs changed).
        effectiveName =
          inGameName ?? (typeof current === "string" ? current : "");
        tx.update(userDoc, patch);
      });

      logger.info("Profile updated", {uid, fields: Object.keys(patch)});
      return {ok: true, inGameName: effectiveName};
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("updateProfile failed", error);
      throw new HttpsError("internal", "Could not save the profile.");
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
  /**
   * E — optional client-generated id. The offline queue in
   * src/features/pendingRuns.ts resends a run after a network failure, and the
   * same id makes that retry land on the SAME document so the score is never
   * counted twice. Old builds do not send one, so it stays optional.
   */
  runId?: unknown;
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
    cors: CALLABLE_CORS,
    invoker: ["public"],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to submit results.");
    }

    const data = (request.data ?? {}) as SubmitGameResultData;
    const run = validateRunData(data);
    // E — only a plain token is accepted, and a malformed one is treated as
    // "no id": a broken id must never fail a run the player already played.
    const runId =
      typeof data.runId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(data.runId)
        ? data.runId
        : null;
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
        // E — a retry carries the same runId, so it resolves to the same
        // document id and this check stops it from being counted twice.
        const resultId = runId
          ? `${uid}-${runId}`
          : db.collection("gameResults").doc().id;
        const resultRef = db.collection("gameResults").doc(resultId);
        const alreadyStored = await tx.get(resultRef);
        if (alreadyStored.exists) {
          logger.info("Duplicate run ignored (retry)", {uid, resultId});
          return {
            bestScore: prevBest,
            totalGames:
              typeof prev.totalGames === "number" ? prev.totalGames : 0,
            totalScore:
              typeof prev.totalScore === "number" ? prev.totalScore : 0,
            newBest: false,
          };
        }

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

// ------------------------------------------------------------------ DATA-02 ---

/** Leaderboard period, as chosen on the Leaderboard screen (UI-03). */
type LeaderboardPeriod = "daily" | "weekly" | "all";

interface GetLeaderboardData {
  period?: unknown;
}

/**
 * One leaderboard row — display data only, never ids (privacy by construction,
 * see getLeaderboard below). `photoUrl` is the Telegram profile photo; null
 * when the player has none (the UI falls back to a sprite).
 */
interface LeaderboardEntry {
  name: string;
  score: number;
  photoUrl: string | null;
}

/**
 * Display name for the leaderboard: the in-game name (UI-04) if set, else the
 * Telegram @username, else first name, else "Player".
 */
function leaderboardName(profileData: {
  inGameName?: unknown;
  username?: unknown;
  firstName?: unknown;
}): string {
  const inGameName = profileData.inGameName;
  if (typeof inGameName === "string" && inGameName.trim().length > 0) {
    return inGameName.trim().slice(0, 30);
  }
  const username = profileData.username;
  if (typeof username === "string" && username.trim().length > 0) {
    return username;
  }
  const firstName = profileData.firstName;
  if (typeof firstName === "string" && firstName.trim().length > 0) {
    return firstName.trim().slice(0, 30);
  }
  return "Player";
}

/**
 * DATA-02 — leaderboard query service (the data behind the UI-03 screen).
 *
 * Firestore rules (SEC-01) keep users/ and gameResults/ private, so the
 * client cannot run ranking queries directly — this callable is the only
 * path. Reads top scores with the Admin SDK and returns ONLY display data:
 * leaderboard name + score, never telegramId/uid (privacy by construction).
 *
 * Periods:
 *  - "all"    — best score per player, users/ ordered by bestScore desc.
 *  - "daily" / "weekly" — best run in the window from gameResults/
 *    createdAt >= start, score desc (maxEntries pool sorted in-function, so
 *    no composite index is required — see backlog DoD).
 */
export const getLeaderboard = onCall(
  {
    region: "europe-north1",
    cors: CALLABLE_CORS,
    invoker: ["public"],
  },
  async (request): Promise<{entries: LeaderboardEntry[]}> => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to view the leaderboard.",
      );
    }
    const periodRaw =
      typeof (request.data ?? {}).period === "string"
        ? ((request.data as GetLeaderboardData).period as string)
        : "";
    if (periodRaw !== "daily" && periodRaw !== "weekly" && periodRaw !== "all") {
      throw new HttpsError(
        "invalid-argument",
        "period must be daily, weekly or all.",
      );
    }
    const period = periodRaw as LeaderboardPeriod;
    const db = getFirestore();

    try {
      if (period === "all") {
        // All Time — the users/ aggregates maintained by submitGameResult.
        const snap = await db
          .collection("users")
          .orderBy("bestScore", "desc")
          .limit(10)
          .get();
        const entries = snap.docs.map((d) => ({
          name: leaderboardName(d.data()),
          score: typeof d.data().bestScore === "number" ? d.data().bestScore : 0,
          photoUrl:
            typeof d.data().photoUrl === "string" ? d.data().photoUrl : null,
        }));
        return {entries};
      }

      // Daily / Weekly — best run inside the window, from the per-run docs.
      // gameResults is written-once per run, so this collection only grows
      // with plays; the window keeps the pool small on a fresh project while
      // staying index-free. If it ever becomes hot, add the composite index
      // (createdAt + score desc) and push orderBy into the query.
      const now = Date.now();
      const windowMs = period === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const snap = await db
        .collection("gameResults")
        .where("createdAt", ">=", new Date(now - windowMs))
        .get();

      const bestByUser = new Map<string, {score: number}>();
      for (const doc of snap.docs) {
        const result = doc.data();
        if (typeof result.uid !== "string" || typeof result.score !== "number") {
          continue;
        }
        const previous = bestByUser.get(result.uid);
        if (!previous || result.score > previous.score) {
          bestByUser.set(result.uid, {score: result.score});
        }
      }

      // Resolve display names for the qualifying users only (2 reads per
      // entry worst case, top 10 max).
      const ranked = [...bestByUser.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 10);
      const entries: LeaderboardEntry[] = [];
      for (const [uid, best] of ranked) {
        const userDoc = await db.collection("users").doc(uid).get();
        const data = userDoc.data() ?? {};
        entries.push({
          name: userDoc.exists ? leaderboardName(data) : "Player",
          score: best.score,
          photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : null,
        });
      }
      return {entries};
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("getLeaderboard failed", error);
      throw new HttpsError("internal", "Could not load the leaderboard.");
    }
  },
);

// ------------------------------------------------------------------ ADM-01 ---

/**
 * ADM-01 / ADM-02 — adminChallengeMutation: the ONE writer for the
 * challenges/ collection.
 *
 * Called from the Admin Panel form (src/features/AdminPage.tsx via
 * src/features/challenges.ts). Firestore rules (SEC-01) deny all client writes
 * to challenges/, so create/update/delete can only happen here, with the Admin
 * SDK.
 *
 * DoD:
 *  - requests without the admin role are rejected with permission-denied;
 *  - create and update persist to Firestore (and are visible to the Challenges
 *    screen, which reads challenges/ ordered by startDate desc);
 *  - delete (ADM-02) irreversibly removes the doc, and reports not-found for
 *    an id that is already gone instead of silently succeeding;
 *  - the payload is re-validated server-side (the client rules in
 *    src/features/challengeValidation.ts are instant feedback, never the trust
 *    boundary), and createdAt/updatedAt/createdBy are stamped here;
 *  - CH-04: type/difficulty/targetValue must match ONE exact ECON-01 tier
 *    triple, and rewardCoins is derived from CHALLENGE_TIERS here — any
 *    rewardCoins in the request is ignored, the client never sends one;
 *  - the update/delete paths write ONLY challenges/{id}: personal daily
 *    assignments (users/{uid}/dailyChallenges) and claimed rewards
 *    (users/{uid}/challengeClaims) are separate documents this function never
 *    touches, so editing a challenge cannot reset/duplicate a claim and
 *    deleting one cannot remove a player's daily assignments. A claim doc is
 *    keyed by challengeId alone, so a user who already claimed cannot claim
 *    the same challenge again after an edit.
 *
 * The role is read from the Firebase ID-token custom claims set by
 * authenticateTelegram (AUTH-03) — never from client-supplied data. The
 * request shape mirrors AdminChallengeMutationRequest in
 * src/features/challenges.ts:
 *   {
 *     operation: "create" | "update" | "delete",
 *     challengeId?: string,
 *     payload?: {
 *       title, description, type, difficulty, targetValue, startDate, endDate
 *     }
 *   }
 *
 * The Admin Panel's confirmation dialog is UX only — this function performs its
 * own authorisation and existence checks and never trusts that a dialog was
 * shown (spec: "Backends nedrīkst paļauties uz šo logu autorizācijai").
 */

/** Challenge kinds supported by the app (CH-04: the four ECON-01 economy
 *  types, mirroring src/features/challenges.ts). */
type ChallengeType = EconomyChallengeType;

/** Raw payload as it arrives from the callable (every field unvalidated). */
interface AdminChallengePayload {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  difficulty?: unknown;
  targetValue?: unknown;
  /** ISO 8601 string — the callable transport is JSON. */
  startDate?: unknown;
  endDate?: unknown;
}

interface AdminChallengeMutationData {
  operation?: unknown;
  challengeId?: unknown;
  payload?: unknown;
}

/** Validated challenge fields, ready to persist. rewardCoins is ALWAYS the
 *  server-derived tier value (see validateChallengePayload) — it never comes
 *  from the request. */
interface ValidatedChallenge {
  title: string;
  description: string;
  type: ChallengeType;
  difficulty: ChallengeDifficulty;
  targetValue: number;
  rewardCoins: number;
  startDate: Date;
  endDate: Date;
}

/** Validation bounds — MUST mirror src/features/challengeValidation.ts. */
export const CHALLENGE_TITLE_MIN = 3;
export const CHALLENGE_TITLE_MAX = 80;
export const CHALLENGE_DESCRIPTION_MIN = 10;
export const CHALLENGE_DESCRIPTION_MAX = 500;
export const CHALLENGE_TARGET_MAX = 1_000_000;

/** ISO 8601 string → Date; throws invalid-argument for missing/corrupt values. */
function parseIsoDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be a valid ISO 8601 date.`,
    );
  }
  return date;
}

/**
 * Server-side re-validation of the admin payload (the trust boundary).
 * Same rules as validateChallengeForm in src/features/challengeValidation.ts:
 * title 3–80, description 10–500, a known type, a known difficulty, whole-
 * number target 1–1 000 000 that is ALSO an allowed tier for that
 * type/difficulty (ECON-01), and endDate on or after startDate. Everything is
 * trimmed like the form does.
 */
export function validateChallengePayload(payload: unknown): ValidatedChallenge {
  if (payload === null || typeof payload !== "object") {
    throw new HttpsError("invalid-argument", "Missing challenge payload.");
  }
  const p = payload as AdminChallengePayload;

  const title = typeof p.title === "string" ? p.title.trim() : "";
  if (title.length < CHALLENGE_TITLE_MIN || title.length > CHALLENGE_TITLE_MAX) {
    throw new HttpsError(
      "invalid-argument",
      `title must be ${CHALLENGE_TITLE_MIN}-${CHALLENGE_TITLE_MAX} characters.`,
    );
  }

  const description =
    typeof p.description === "string" ? p.description.trim() : "";
  if (
    description.length < CHALLENGE_DESCRIPTION_MIN ||
    description.length > CHALLENGE_DESCRIPTION_MAX
  ) {
    throw new HttpsError(
      "invalid-argument",
      `description must be ${CHALLENGE_DESCRIPTION_MIN}-` +
        `${CHALLENGE_DESCRIPTION_MAX} characters.`,
    );
  }

  const type = CHALLENGE_TYPES.find((candidate) => candidate === p.type);
  if (!type) {
    throw new HttpsError(
      "invalid-argument",
      `type must be one of: ${CHALLENGE_TYPES.join(", ")}.`,
    );
  }

  const difficulty = CHALLENGE_DIFFICULTIES.find(
    (candidate) => candidate === p.difficulty,
  );
  if (!difficulty) {
    throw new HttpsError(
      "invalid-argument",
      `difficulty must be one of: ${CHALLENGE_DIFFICULTIES.join(", ")}.`,
    );
  }

  const targetValue = p.targetValue;
  if (
    typeof targetValue !== "number" ||
    !Number.isInteger(targetValue) ||
    targetValue <= 0 ||
    targetValue > CHALLENGE_TARGET_MAX
  ) {
    throw new HttpsError(
      "invalid-argument",
      `targetValue must be a whole number between 1 and ${CHALLENGE_TARGET_MAX}.`,
    );
  }

  // CH-04 — the exact ECON-01 tier triple decides validity AND the payout.
  // lookupTierReward answers null for anything outside CHALLENGE_TIERS, so an
  // arbitrary (legacy-style) target or a mismatched difficulty is rejected
  // instead of guessing a reward. rewardCoins is derived here from the table;
  // any rewardCoins sent by the client is deliberately never read.
  const rewardCoins = lookupTierReward(type, difficulty, targetValue);
  if (rewardCoins === null) {
    throw new HttpsError(
      "invalid-argument",
      "type, difficulty and targetValue must match one of the allowed " +
        "challenge tiers.",
    );
  }

  const startDate = parseIsoDate(p.startDate, "startDate");
  const endDate = parseIsoDate(p.endDate, "endDate");
  if (endDate.getTime() < startDate.getTime()) {
    throw new HttpsError(
      "invalid-argument",
      "endDate must be on or after startDate.",
    );
  }

  return {
    title,
    description,
    type,
    difficulty,
    targetValue,
    rewardCoins,
    startDate,
    endDate,
  };
}

/** The stored challenge fields, copied from the validated payload. The tier
 *  triple (type/difficulty/targetValue) always travels WITH its server-derived
 *  rewardCoins, so every document written from here on is a complete economy
 *  configuration; legacy documents that predate CH-04 keep none of these
 *  reward fields until they are explicitly edited through this function. */
function challengeFields(validated: ValidatedChallenge) {
  return {
    title: validated.title,
    description: validated.description,
    type: validated.type,
    difficulty: validated.difficulty,
    targetValue: validated.targetValue,
    rewardCoins: validated.rewardCoins,
    startDate: validated.startDate,
    endDate: validated.endDate,
  };
}

export const adminChallengeMutation = onCall(
  {
    region: "europe-north1",
    cors: CALLABLE_CORS,
    invoker: ["public"],
  },
  async (request): Promise<{ok: boolean; challengeId: string}> => {
    // ADM-01 DoD: no session → unauthenticated; a non-admin role → forbidden.
    // The role comes from the ID-token custom claim (AUTH-03).
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in as an administrator to manage challenges.",
      );
    }
    if (request.auth.token.role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "Only administrators may change challenges.",
      );
    }

    const data = (request.data ?? {}) as AdminChallengeMutationData;
    const operation = data.operation;
    if (
      operation !== "create" &&
      operation !== "update" &&
      operation !== "delete"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "operation must be create, update or delete.",
      );
    }

    const db = getFirestore();
    const now = new Date();

    try {
      if (operation === "create") {
        const validated = validateChallengePayload(data.payload);
        // Server-generated id; the Challenges screen sorts by startDate, so no
        // extra index is needed for the list read.
        const ref = db.collection("challenges").doc();
        await ref.set({
          ...challengeFields(validated),
          createdBy: request.auth.uid,
          createdAt: now,
          updatedAt: now,
        });
        logger.info("Challenge created", {
          challengeId: ref.id,
          uid: request.auth.uid,
        });
        return {ok: true, challengeId: ref.id};
      }

      // update/delete — challengeId identifies an existing doc; createdAt/
      // createdBy are stamped once on create and stay immutable.
      const challengeId = data.challengeId;
      if (typeof challengeId !== "string" || challengeId.trim().length === 0) {
        throw new HttpsError(
          "invalid-argument",
          `challengeId is required to ${operation} a challenge.`,
        );
      }
      const ref = db.collection("challenges").doc(challengeId);

      if (operation === "delete") {
        // ADM-02 — permanent removal. The transaction keeps "is it there?"
        // and "remove it" one decision, so a challenge deleted in the meantime
        // answers not-found rather than reporting a false success.
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists) {
            throw new HttpsError("not-found", "Challenge not found.");
          }
          tx.delete(ref);
        });
        logger.info("Challenge deleted", {
          challengeId,
          uid: request.auth.uid,
        });
        return {ok: true, challengeId};
      }

      const validated = validateChallengePayload(data.payload);
      const fields = challengeFields(validated);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          throw new HttpsError("not-found", "Challenge not found.");
        }
        tx.update(ref, {...fields, updatedAt: now});
      });
      logger.info("Challenge updated", {
        challengeId,
        uid: request.auth.uid,
      });
      return {ok: true, challengeId};
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("adminChallengeMutation failed", error);
      throw new HttpsError("internal", "Could not save the challenge.");
    }
  },
);
