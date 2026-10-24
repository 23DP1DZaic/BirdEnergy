// ECON-02 — the client half of reward claiming: one typed wrapper around the
// claimChallengeReward callable.
//
// The client sends ONLY the source and the challenge id. The server resolves
// the challenge, its window, the reward, progress from accepted runs, the
// caller's identity and the balance. Nothing else may be passed in, and no
// Firestore writes happen from here (the rules deny them).
//
// The call is idempotent: double clicks, concurrent tabs and network retries
// all resolve to one claim. A repeated call returns alreadyClaimed: true with
// the ORIGINAL reward and the current balance instead of an error, so the UI
// can simply say "already claimed" and show the balance it gets back.
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

export type ChallengeRewardSource = 'daily' | 'admin'

export interface ClaimChallengeRewardResult {
  ok: true
  challengeId: string
  source: ChallengeRewardSource
  /** Coins this claim is worth (the original reward for an already claim). */
  rewardCoins: number
  /** Balance after the claim (unchanged for an already claim). */
  coins: number
  alreadyClaimed: boolean
}

/** Claim one completed challenge's reward, exactly once. */
export async function claimChallengeReward(
  source: ChallengeRewardSource,
  challengeId: string,
): Promise<ClaimChallengeRewardResult> {
  const call = httpsCallable<
    { source: ChallengeRewardSource; challengeId: string },
    ClaimChallengeRewardResult
  >(functions, 'claimChallengeReward')
  const response = await call({ source, challengeId })
  return response.data
}
