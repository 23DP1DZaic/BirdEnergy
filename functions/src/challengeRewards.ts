/**
 * ECON-02 — challenge progress integration and reward claiming.
 *
 * One claim path for both challenge sources:
 *   - "daily": a snapshot inside users/{uid}/dailyChallenges/{dateKey}
 *     (assigned by CH-05; the id embeds its dateKey),
 *   - "admin": a challenges/{id} document created by ADM-01.
 *
 * Progress is NEVER stored and NEVER accepted from the client: it is recomputed
 * here from the accepted gameResults rows (submitGameResult is the only writer)
 * inside that challenge's own window, using the same CH-05 calculation the
 * daily screen uses. Claiming creates a claim document and leaves the results
 * untouched, so a claim can never reset progress.
 *
 * The client sends only {source, challengeId}. Reward coins, progress,
 * balances and user ids are all resolved server-side; the caller's uid comes
 * from the Firebase ID token in the callable wrapper (index.ts).
 *
 * Idempotency: users/{uid}/challengeClaims/{challengeId} is the single source
 * of truth. It is created in the SAME transaction that increments the balance,
 * so double clicks, concurrent tabs and network retries award coins once; an
 * already-claimed request returns a successful "alreadyClaimed" result (and
 * the original reward) without writing anything.
 *
 * Admin SDK writes bypass Firestore Security Rules by design: every check in
 * this file is the trust boundary for clients, which have no direct write
 * access to users/{uid}, its subcollections, challenges or gameResults.
 */
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_TYPES,
  lookupTierReward,
  type ChallengeDifficulty,
  type DailyChallengeAssignment,
  type EconomyChallengeType,
} from "./economy.js";
import {
  computeChallengeProgress,
  dailyChallengeDateKey,
  isAssignmentSnapshot,
  readGameResultsInWindow,
  toDate,
  type DailyChallengeBounds,
} from "./dailyChallenges.js";

export type ChallengeRewardSource = "daily" | "admin";

/** Raw callable payload — every field unvalidated by definition. */
export interface ClaimChallengeRewardRequest {
  source?: unknown;
  challengeId?: unknown;
}

export interface ClaimChallengeRewardResult {
  ok: true;
  challengeId: string;
  source: ChallengeRewardSource;
  /** Coins this claim is worth (the original reward for an already claim). */
  rewardCoins: number;
  /** Current balance after the claim (unchanged for an already claim). */
  coins: number;
  alreadyClaimed: boolean;
}

/** Clients may send ids only — no path separators, sane length. */
const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function invalid(message: string): HttpsError {
  return new HttpsError("invalid-argument", message);
}

function precondition(message: string): HttpsError {
  return new HttpsError("failed-precondition", message);
}

function notFound(message: string): HttpsError {
  return new HttpsError("not-found", message);
}

/** The stored balance, treated as 0 while the field is absent/corrupt. */
function readCoins(data: Record<string, unknown> | undefined): number {
  const coins = data?.coins;
  return typeof coins === "number" && Number.isFinite(coins) && coins >= 0
    ? coins
    : 0;
}

function readClaimReward(data: Record<string, unknown> | undefined): number {
  const reward = data?.rewardCoins;
  return typeof reward === "number" && Number.isFinite(reward) && reward > 0
    ? reward
    : 0;
}

/**
 * A daily assignment snapshot must still be an allowed ECON-01 tier. The
 * payout is the SNAPSHOT's rewardCoins (assignments are immutable once
 * assigned — a later config edit must not silently change an assigned reward),
 * but a triple that is no longer in the table is rejected rather than paid.
 */
function dailyPayout(assignment: DailyChallengeAssignment): number {
  if (
    lookupTierReward(
      assignment.type,
      assignment.difficulty,
      assignment.targetValue,
    ) === null
  ) {
    throw precondition("This daily challenge has no valid reward configuration.");
  }
  const reward = assignment.rewardCoins;
  if (typeof reward !== "number" || !Number.isInteger(reward) || reward <= 0) {
    throw precondition("This daily challenge has no valid reward configuration.");
  }
  return reward;
}

function findDailyAssignment(
  data: Record<string, unknown>,
  challengeId: string,
): DailyChallengeAssignment | null {
  const assignments = data.assignments;
  if (!Array.isArray(assignments)) return null;
  return (
    assignments.find(
      (candidate): candidate is DailyChallengeAssignment =>
        isAssignmentSnapshot(candidate) && candidate.id === challengeId,
    ) ?? null
  );
}

interface AdminChallengeConfig {
  type: EconomyChallengeType;
  difficulty: ChallengeDifficulty;
  targetValue: number;
  rewardCoins: number;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Validates a challenges/{id} document as a COMPLETE reward configuration.
 * Legacy documents from before CH-04 carry no difficulty/rewardCoins and are
 * rejected here (they were always documented as non-rewarding), as is a
 * document whose stored reward disagrees with the tier table — the server
 * never pays a number the configuration cannot justify.
 */
function parseAdminChallenge(
  data: Record<string, unknown> | undefined,
): AdminChallengeConfig {
  if (!data) {
    throw precondition("This challenge has no valid reward configuration.");
  }
  const type = CHALLENGE_TYPES.find((candidate) => candidate === data.type);
  const difficulty = CHALLENGE_DIFFICULTIES.find(
    (candidate) => candidate === data.difficulty,
  );
  const targetValue = data.targetValue;
  if (
    !type ||
    !difficulty ||
    typeof targetValue !== "number" ||
    !Number.isInteger(targetValue) ||
    targetValue <= 0
  ) {
    throw precondition("This challenge has no valid reward configuration.");
  }
  const tableReward = lookupTierReward(type, difficulty, targetValue);
  const rewardCoins = data.rewardCoins;
  if (
    tableReward === null ||
    typeof rewardCoins !== "number" ||
    rewardCoins !== tableReward
  ) {
    throw precondition("This challenge has no valid reward configuration.");
  }
  const startsAt = toDate(data.startDate);
  const endsAt = toDate(data.endDate);
  if (!startsAt || !endsAt || endsAt.getTime() < startsAt.getTime()) {
    throw precondition("This challenge has no valid time window.");
  }
  return {type, difficulty, targetValue, rewardCoins, startsAt, endsAt};
}

function alreadyClaimedResult(
  challengeId: string,
  source: ChallengeRewardSource,
  claimData: Record<string, unknown> | undefined,
  coins: number,
): ClaimChallengeRewardResult {
  return {
    ok: true,
    challengeId,
    source,
    rewardCoins: readClaimReward(claimData),
    coins,
    alreadyClaimed: true,
  };
}

function claimedResult(
  challengeId: string,
  source: ChallengeRewardSource,
  rewardCoins: number,
  coins: number,
): ClaimChallengeRewardResult {
  return {
    ok: true,
    challengeId,
    source,
    rewardCoins,
    coins,
    alreadyClaimed: false,
  };
}

async function claimDaily(
  db: Firestore,
  uid: string,
  userRef: DocumentReference,
  claimRef: DocumentReference,
  challengeId: string,
): Promise<ClaimChallengeRewardResult> {
  const dateKey = dailyChallengeDateKey(challengeId);
  if (!dateKey) {
    throw notFound("Daily challenge not found.");
  }
  const dailyRef = db
    .collection(`users/${uid}/dailyChallenges`)
    .doc(dateKey);

  const dailySnap = await dailyRef.get();
  if (!dailySnap.exists) throw notFound("Daily challenge not found.");
  const dailyData = dailySnap.data() ?? {};
  const assignment = findDailyAssignment(dailyData, challengeId);
  if (!assignment) throw notFound("Daily challenge not found.");

  const startsAt = toDate(dailyData.startsAt);
  const expiresAt = toDate(dailyData.expiresAt);
  if (!startsAt || !expiresAt) {
    throw precondition("This daily challenge has no valid time window.");
  }

  // A claimed reward stays idempotent even after the day has expired.
  const existingClaim = await claimRef.get();
  if (existingClaim.exists) {
    // Re-read the balance instead of using the pre-flight profile read: a
    // concurrent claim may have committed its increment in between.
    const freshProfile = await userRef.get();
    return alreadyClaimedResult(
      challengeId,
      "daily",
      existingClaim.data(),
      readCoins(freshProfile.data()),
    );
  }

  const now = new Date();
  if (now.getTime() >= expiresAt.getTime()) {
    throw precondition("This daily challenge has expired.");
  }

  const results = await readGameResultsInWindow(db, uid, {
    startsAt,
    expiresAt,
  });
  const progress = computeChallengeProgress(assignment.type, results);
  if (progress < assignment.targetValue) {
    throw precondition("This daily challenge is not completed yet.");
  }

  return db.runTransaction(async (tx) => {
    const claimSnap = await tx.get(claimRef);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw precondition("No player profile — accept data processing first.");
    }
    if (claimSnap.exists) {
      return alreadyClaimedResult(
        challengeId,
        "daily",
        claimSnap.data(),
        readCoins(userSnap.data()),
      );
    }

    // Re-read the daily set inside the transaction: the assignment must still
    // belong to this user, still be unclaimed and still be in time.
    const freshSnap = await tx.get(dailyRef);
    if (!freshSnap.exists) throw notFound("Daily challenge not found.");
    const freshData = freshSnap.data() ?? {};
    const freshExpires = toDate(freshData.expiresAt);
    const freshAssignments = freshData.assignments;
    if (!freshExpires || !Array.isArray(freshAssignments)) {
      throw precondition("This daily challenge has no valid time window.");
    }
    const index = freshAssignments.findIndex(
      (candidate): candidate is DailyChallengeAssignment =>
        isAssignmentSnapshot(candidate) && candidate.id === challengeId,
    );
    if (index < 0) throw notFound("Daily challenge not found.");
    const fresh = freshAssignments[index];
    if (!isAssignmentSnapshot(fresh)) {
      throw precondition("This daily challenge has no valid configuration.");
    }

    const claimedAt = new Date();
    if (claimedAt.getTime() >= freshExpires.getTime()) {
      throw precondition("This daily challenge has expired.");
    }
    if (fresh.claimedAt !== null) {
      // Snapshot already marked but the claim doc is missing (a legacy or
      // hand-edited document): never pay twice for it.
      return alreadyClaimedResult(
        challengeId,
        "daily",
        {rewardCoins: dailyPayout(fresh)},
        readCoins(userSnap.data()),
      );
    }

    const freshReward = dailyPayout(fresh);
    const assignments = [...freshAssignments];
    assignments[index] = {...fresh, claimedAt};

    tx.set(claimRef, {
      challengeId,
      rewardCoins: freshReward,
      claimedAt,
    });
    tx.update(dailyRef, {assignments});
    tx.update(userRef, {coins: FieldValue.increment(freshReward)});

    return claimedResult(
      challengeId,
      "daily",
      freshReward,
      readCoins(userSnap.data()) + freshReward,
    );
  });
}

async function claimAdmin(
  db: Firestore,
  uid: string,
  userRef: DocumentReference,
  claimRef: DocumentReference,
  challengeId: string,
): Promise<ClaimChallengeRewardResult> {
  const challengeRef = db.collection("challenges").doc(challengeId);

  const challengeSnap = await challengeRef.get();
  if (!challengeSnap.exists) throw notFound("Challenge not found.");
  const config = parseAdminChallenge(challengeSnap.data());

  // Claims are idempotent regardless of later edits or expiry.
  const existingClaim = await claimRef.get();
  if (existingClaim.exists) {
    const freshProfile = await userRef.get();
    return alreadyClaimedResult(
      challengeId,
      "admin",
      existingClaim.data(),
      readCoins(freshProfile.data()),
    );
  }

  const now = new Date();
  if (now.getTime() < config.startsAt.getTime()) {
    throw precondition("This challenge has not started yet.");
  }
  if (now.getTime() > config.endsAt.getTime()) {
    throw precondition("This challenge has expired.");
  }

  // endDate is inclusive (CH-01 treats now > endDate as finished), so the
  // half-open query window ends one millisecond after it.
  const window: DailyChallengeBounds = {
    startsAt: config.startsAt,
    expiresAt: new Date(config.endsAt.getTime() + 1),
  };
  const results = await readGameResultsInWindow(db, uid, window);
  const progress = computeChallengeProgress(config.type, results);
  if (progress < config.targetValue) {
    throw precondition("This challenge is not completed yet.");
  }

  return db.runTransaction(async (tx) => {
    const claimSnap = await tx.get(claimRef);
    const userSnap = await tx.get(userRef);
    const freshChallenge = await tx.get(challengeRef);
    if (!userSnap.exists) {
      throw precondition("No player profile — accept data processing first.");
    }
    if (claimSnap.exists) {
      return alreadyClaimedResult(
        challengeId,
        "admin",
        claimSnap.data(),
        readCoins(userSnap.data()),
      );
    }
    if (!freshChallenge.exists) throw notFound("Challenge not found.");

    // Progress above was computed against the pre-transaction config: if an
    // admin edited the window/target meanwhile, the next attempt recomputes
    // rather than paying against a stale window.
    const fresh = parseAdminChallenge(freshChallenge.data());
    if (
      fresh.type !== config.type ||
      fresh.difficulty !== config.difficulty ||
      fresh.targetValue !== config.targetValue ||
      fresh.rewardCoins !== config.rewardCoins ||
      fresh.startsAt.getTime() !== config.startsAt.getTime() ||
      fresh.endsAt.getTime() !== config.endsAt.getTime()
    ) {
      throw precondition("The challenge changed — please try again.");
    }

    const claimedAt = new Date();
    if (claimedAt.getTime() < fresh.startsAt.getTime()) {
      throw precondition("This challenge has not started yet.");
    }
    if (claimedAt.getTime() > fresh.endsAt.getTime()) {
      throw precondition("This challenge has expired.");
    }

    tx.set(claimRef, {
      challengeId,
      rewardCoins: fresh.rewardCoins,
      claimedAt,
    });
    tx.update(userRef, {coins: FieldValue.increment(fresh.rewardCoins)});

    return claimedResult(
      challengeId,
      "admin",
      fresh.rewardCoins,
      readCoins(userSnap.data()) + fresh.rewardCoins,
    );
  });
}

/**
 * The claim handler core (index.ts wraps it in onCall with request.auth).
 *
 * Order of checks:
 *   1. payload shape (source, challengeId — nothing else is read),
 *   2. the profile exists (Admin SDK's transactions cannot create it),
 *   3. an existing claim wins over everything else (idempotent retry),
 *   4. the challenge exists and, when source is daily, lives under this uid,
 *   5. the challenge's time window (not expired / not upcoming),
 *   6. completion from trusted accepted results,
 *   7. a transaction that re-checks and atomically creates the claim,
 *      marks the daily snapshot claimed, and increments coins.
 */
export async function claimChallengeRewardCore(
  db: Firestore,
  uid: string,
  request: ClaimChallengeRewardRequest,
): Promise<ClaimChallengeRewardResult> {
  const source = request.source;
  if (source !== "daily" && source !== "admin") {
    throw invalid("source must be \"daily\" or \"admin\".");
  }
  const challengeId = request.challengeId;
  if (
    typeof challengeId !== "string" ||
    !CHALLENGE_ID_PATTERN.test(challengeId)
  ) {
    throw invalid("challengeId is required.");
  }

  const userRef = db.collection("users").doc(uid);
  const profileSnap = await userRef.get();
  if (!profileSnap.exists) {
    throw precondition("No player profile — accept data processing first.");
  }

  // Claim documents are keyed by challengeId alone, so an admin edit or a
  // finished day can never unlock a second claim for the same id.
  const claimRef = db.collection(`users/${uid}/challengeClaims`).doc(challengeId);
  const existingClaim = await claimRef.get();
  if (existingClaim.exists) {
    const freshProfile = await userRef.get();
    return alreadyClaimedResult(
      challengeId,
      source,
      existingClaim.data(),
      readCoins(freshProfile.data()),
    );
  }

  return source === "daily"
    ? claimDaily(db, uid, userRef, claimRef, challengeId)
    : claimAdmin(db, uid, userRef, claimRef, challengeId);
}
