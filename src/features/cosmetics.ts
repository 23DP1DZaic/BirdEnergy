// SHOP-01 — the client half of cosmetic purchases: one typed wrapper around
// the purchaseCosmetic callable.
//
// The client sends only the kind and the catalog id. The server validates the
// id against the trusted catalog, derives the price, and atomically checks the
// balance/ownership before writing. The response is the authoritative balance
// and ownership state, which the wardrobe uses to unlock the item immediately.
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import type { CosmeticKind } from './economy'

export interface PurchaseCosmeticResult {
  ok: true
  kind: CosmeticKind
  itemId: string
  /** Server-derived price (0 for the free sets). */
  price: number
  /** True when nothing was charged (already owned). */
  alreadyOwned: boolean
  /** Balance after the purchase. */
  coins: number
  ownedSkinIds: string[]
  ownedBackgroundIds: string[]
}

/** Buy one cosmetic. An already-owned item resolves without spending coins. */
export async function purchaseCosmetic(
  kind: CosmeticKind,
  itemId: string,
): Promise<PurchaseCosmeticResult> {
  const buy = httpsCallable<
    { kind: CosmeticKind; itemId: string },
    PurchaseCosmeticResult
  >(functions, 'purchaseCosmetic')
  const response = await buy({ kind, itemId })
  return response.data
}
