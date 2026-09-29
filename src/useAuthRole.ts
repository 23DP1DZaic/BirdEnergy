// UI-02 — resolve the signed-in role for the Admin nav link.
//
// AUTH-03 puts the role into the Firebase ID-token custom claims, so reading
// the claim (instead of only the sign-in response) survives page reloads.
// The claim is re-read whenever the session uid changes (null → uid right
// after sign-in). No state is written synchronously in the effect: while the
// token result is pending the previous claim stays, and a signed-out state
// derives to null at the return instead of via setState.
import { useEffect, useState } from 'react'
import type { TelegramRole } from './auth'
import { auth } from './firebase'

export function useAuthRole(uid: string | null): TelegramRole | null {
  const [claimRole, setClaimRole] = useState<TelegramRole | null>(null)

  useEffect(() => {
    if (!uid) return
    const user = auth.currentUser
    if (!user) return
    let cancelled = false
    user
      .getIdTokenResult()
      .then((token) => {
        if (cancelled) return
        const role = token.claims.role
        if (role === 'admin' || role === 'user') setClaimRole(role)
      })
      .catch(() => {
        // Token refresh failure → keep the previous claim.
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  return uid ? claimRole : null
}
