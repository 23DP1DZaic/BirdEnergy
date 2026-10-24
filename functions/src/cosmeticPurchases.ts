/**
 * SHOP-01 — cosmetic purchases and ownership.
 *
 * One authenticated purchase path for skins and backgrounds:
 *   - the catalog, the free sets and the prices come from economy.ts (the
 *     server's trusted configuration); nothing price- or ownership-related is
 *     ever read from the request,
 *   - free items are owned by every account and never charge coins,
 *   - an already-owned item is an idempotent no-op (no second deduction),
 *   - coins and ownership are read and written in ONE transaction, so two
 *     concurrent purchases can never both spend the same coins or leave a
 *     negative balance.
 *
 * The client only sends {kind, itemId}. The balance, the owned lists and the
 * purchase outcome all come back from here; direct writes to users/{uid} are
 * denied by the Firestore rules (SEC-01), so this callable is the only path.
 */
import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {
  BACKGROUND_IDS,
  FREE_BACKGROUND_IDS,
  FREE_SKIN_IDS,
  PAID_BACKGROUND_PRICE,
  PAID_SKIN_PRICE,
  SKIN_IDS,
  ownedCatalogIds,
} from "./economy.js";

export type CosmeticKind = "skin" | "background";

/** Raw callable payload — every field unvalidated by definition. */
export interface PurchaseCosmeticRequest {
  kind?: unknown;
  itemId?: unknown;
}

export interface PurchaseCosmeticResult {
  ok: true;
  kind: CosmeticKind;
  itemId: string;
  /** Server-derived price (0 for the free sets). */
  price: number;
  /** True when nothing was charged (already owned). */
  alreadyOwned: boolean;
  /** Balance after the purchase. */
  coins: number;
  /** Full ownership state, catalog-ordered, free grants included. */
  ownedSkinIds: string[];
  ownedBackgroundIds: string[];
}

interface CosmeticTarget {
  kind: CosmeticKind;
  itemId: string;
  price: number;
  /** users/{uid} field this item is granted into. */
  field: "ownedSkinIds" | "ownedBackgroundIds";
}

function invalid(message: string): HttpsError {
  return new HttpsError("invalid-argument", message);
}

function precondition(message: string): HttpsError {
  return new HttpsError("failed-precondition", message);
}

/** The stored balance, treated as 0 while the field is absent/corrupt. */
function readCoins(data: Record<string, unknown> | undefined): number {
  const coins = data?.coins;
  return typeof coins === "number" && Number.isFinite(coins) && coins >= 0
    ? coins
    : 0;
}

/**
 * Validates the request against the trusted catalogs and derives the price
 * here. An unknown id (or a non-catalog string) is rejected instead of being
 * priced by the client.
 */
function resolveTarget(kind: unknown, itemId: unknown): CosmeticTarget {
  if (kind !== "skin" && kind !== "background") {
    throw invalid("kind must be \"skin\" or \"background\".");
  }
  if (typeof itemId !== "string" || itemId.length === 0 || itemId.length > 100) {
    throw invalid("itemId is required.");
  }

  if (kind === "skin") {
    if (!(SKIN_IDS as readonly string[]).includes(itemId)) {
      throw invalid("Unknown cosmetic item.");
    }
    return {
      kind,
      itemId,
      price: FREE_SKIN_IDS.includes(itemId) ? 0 : PAID_SKIN_PRICE,
      field: "ownedSkinIds",
    };
  }

  if (!(BACKGROUND_IDS as readonly string[]).includes(itemId)) {
    throw invalid("Unknown cosmetic item.");
  }
  return {
    kind,
    itemId,
    price: FREE_BACKGROUND_IDS.includes(itemId) ? 0 : PAID_BACKGROUND_PRICE,
    field: "ownedBackgroundIds",
  };
}

/**
 * Purchase one catalog item for the authenticated uid.
 *
 * Everything runs in a single transaction, so the ownership check, the
 * balance check and both writes see one consistent state:
 *   - already owned (including every free id) → no write at all,
 *   - price > balance → failed-precondition, no write,
 *   - otherwise the id is appended to the catalog-ordered owned list and the
 *     price is subtracted from coins.
 */
export async function purchaseCosmeticCore(
  db: Firestore,
  uid: string,
  request: PurchaseCosmeticRequest,
): Promise<PurchaseCosmeticResult> {
  const target = resolveTarget(request.kind, request.itemId);
  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw precondition("No player profile — accept data processing first.");
    }
    const data = snap.data() ?? {};

    const coins = readCoins(data);
    const ownedSkins = ownedCatalogIds(
      SKIN_IDS,
      FREE_SKIN_IDS,
      data.ownedSkinIds,
    );
    const ownedBackgrounds = ownedCatalogIds(
      BACKGROUND_IDS,
      FREE_BACKGROUND_IDS,
      data.ownedBackgroundIds,
    );
    const owned = target.kind === "skin" ? ownedSkins : ownedBackgrounds;
    const free =
      target.kind === "skin" ? FREE_SKIN_IDS : FREE_BACKGROUND_IDS;

    const alreadyOwned = free.includes(target.itemId) ||
      owned.includes(target.itemId);
    if (alreadyOwned) {
      return {
        ok: true,
        kind: target.kind,
        itemId: target.itemId,
        price: target.price,
        alreadyOwned: true,
        coins,
        ownedSkinIds: ownedSkins,
        ownedBackgroundIds: ownedBackgrounds,
      };
    }

    if (coins < target.price) {
      throw precondition(
        `Not enough coins — this item costs ${target.price}.`,
      );
    }

    const nextSkins = target.kind === "skin"
      ? ownedCatalogIds(SKIN_IDS, FREE_SKIN_IDS, [...ownedSkins, target.itemId])
      : ownedSkins;
    const nextBackgrounds = target.kind === "background"
      ? ownedCatalogIds(
        BACKGROUND_IDS,
        FREE_BACKGROUND_IDS,
        [...ownedBackgrounds, target.itemId],
      )
      : ownedBackgrounds;

    tx.update(userRef, {
      [target.field]: target.kind === "skin" ? nextSkins : nextBackgrounds,
      coins: FieldValue.increment(-target.price),
    });

    return {
      ok: true,
      kind: target.kind,
      itemId: target.itemId,
      price: target.price,
      alreadyOwned: false,
      coins: coins - target.price,
      ownedSkinIds: nextSkins,
      ownedBackgroundIds: nextBackgrounds,
    };
  });
}
