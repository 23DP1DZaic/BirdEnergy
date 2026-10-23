/**
 * ECON-01 — backward-compatible, idempotent initialization of the economy
 * fields on users/{uid}.
 *
 * Runs entirely inside one transaction (Firestore retries it on write
 * conflict, so concurrent sign-ins each recompute the patch from a fresh
 * read and cannot interleave into a half-initialized document):
 *
 *   - never CREATES the profile — consent (DATA-01) owns users/{uid}
 *     creation; a missing document is a no-op (returns false),
 *   - never overwrites established economy fields: an already-current
 *     document produces an empty patch and no write at all (returns false),
 *   - grants the 7 free skins + 3 free backgrounds, fills coins: 0 and the
 *     economyVersion stamp on legacy profiles,
 *   - replaces a previously selected but now-locked equipped cosmetic with
 *     the free default (see buildEconomyPatch for the exact rules).
 *
 * Wired into both sign-in paths (authenticateTelegram with consent, and the
 * acceptDataProcessing callable) as a best-effort follow-up: a failure there
 * is logged and retried on the next sign-in, never allowed to block login.
 *
 * Returns whether the document was written.
 */
import type {Firestore} from "firebase-admin/firestore";
import {buildEconomyPatch} from "./economy.js";

export async function initializeEconomy(
  db: Firestore,
  uid: string,
): Promise<boolean> {
  const userDoc = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userDoc);
    if (!snap.exists) return false;
    const patch = buildEconomyPatch(snap.data());
    if (Object.keys(patch).length === 0) return false;
    tx.update(userDoc, patch);
    return true;
  });
}
