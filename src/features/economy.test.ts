/**
 * ECON-01 — the client economy copy must stay value-identical to the server
 * config in functions/src/economy.ts.
 *
 * The two toolchains cannot share one file (Cloud Functions deploys only its
 * own directory), so both sides carry a copy with MUST-mirror comments. This
 * suite deep-compares every shared constant, so editing one side without the
 * other fails here — the drift the mirror comments warn about becomes a red
 * test instead of a silent divergence. The server side additionally pins the
 * spec table itself in functions/test/economy.test.ts.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BACKGROUND_IDS,
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_TIERS,
  CHALLENGE_TYPES,
  DAILY_CHALLENGE_COUNT,
  DEFAULT_BACKGROUND_INDEX,
  DEFAULT_SKIN_INDEX,
  ECONOMY_VERSION,
  FREE_BACKGROUND_IDS,
  FREE_SKIN_IDS,
  PAID_BACKGROUND_PRICE,
  PAID_SKIN_PRICE,
  SKIN_IDS,
  isFreeBackgroundId,
  isFreeSkinId,
  lookupTierReward,
} from './economy.ts'
import {
  BACKGROUND_IDS as SERVER_BACKGROUND_IDS,
  CHALLENGE_DIFFICULTIES as SERVER_CHALLENGE_DIFFICULTIES,
  CHALLENGE_TIERS as SERVER_CHALLENGE_TIERS,
  CHALLENGE_TYPES as SERVER_CHALLENGE_TYPES,
  DAILY_CHALLENGE_COUNT as SERVER_DAILY_CHALLENGE_COUNT,
  DEFAULT_BACKGROUND_INDEX as SERVER_DEFAULT_BACKGROUND_INDEX,
  DEFAULT_SKIN_INDEX as SERVER_DEFAULT_SKIN_INDEX,
  ECONOMY_VERSION as SERVER_ECONOMY_VERSION,
  FREE_BACKGROUND_IDS as SERVER_FREE_BACKGROUND_IDS,
  FREE_SKIN_IDS as SERVER_FREE_SKIN_IDS,
  PAID_BACKGROUND_PRICE as SERVER_PAID_BACKGROUND_PRICE,
  PAID_SKIN_PRICE as SERVER_PAID_SKIN_PRICE,
  SKIN_IDS as SERVER_SKIN_IDS,
} from '../../functions/src/economy.ts'

describe('economy mirror — client copy === server copy', () => {
  it('shares the challenge types and difficulty labels', () => {
    assert.deepEqual(CHALLENGE_TYPES, SERVER_CHALLENGE_TYPES)
    assert.deepEqual(CHALLENGE_DIFFICULTIES, SERVER_CHALLENGE_DIFFICULTIES)
    // The two original admin challenge types must survive on both sides.
    assert.ok(CHALLENGE_TYPES.includes('single_game_score'))
    assert.ok(CHALLENGE_TYPES.includes('games_played'))
  })

  it('shares the full tier/reward table', () => {
    assert.deepEqual(CHALLENGE_TIERS, SERVER_CHALLENGE_TIERS)
  })

  it('shares the catalogs, the explicit free IDs and the prices', () => {
    assert.deepEqual(SKIN_IDS, SERVER_SKIN_IDS)
    assert.deepEqual(BACKGROUND_IDS, SERVER_BACKGROUND_IDS)
    assert.deepEqual(FREE_SKIN_IDS, SERVER_FREE_SKIN_IDS)
    assert.deepEqual(FREE_BACKGROUND_IDS, SERVER_FREE_BACKGROUND_IDS)
    assert.equal(PAID_SKIN_PRICE, SERVER_PAID_SKIN_PRICE)
    assert.equal(PAID_BACKGROUND_PRICE, SERVER_PAID_BACKGROUND_PRICE)
    assert.equal(FREE_SKIN_IDS.length, 7)
    assert.equal(FREE_BACKGROUND_IDS.length, 3)
  })

  it('shares the version, daily count and equipped defaults', () => {
    assert.equal(ECONOMY_VERSION, SERVER_ECONOMY_VERSION)
    assert.equal(DAILY_CHALLENGE_COUNT, SERVER_DAILY_CHALLENGE_COUNT)
    assert.equal(DEFAULT_SKIN_INDEX, SERVER_DEFAULT_SKIN_INDEX)
    assert.equal(DEFAULT_BACKGROUND_INDEX, SERVER_DEFAULT_BACKGROUND_INDEX)
  })
})

describe('client economy helpers', () => {
  it('looks up rewards for allowed triples', () => {
    assert.equal(lookupTierReward('total_jumps', 'normal', 40), 30)
    assert.equal(lookupTierReward('games_played', 'hard', 15), 100)
    assert.equal(lookupTierReward('single_game_score', 'hard', 60), 130)
    assert.equal(lookupTierReward('total_score', 'hard', 500), 150)
  })

  it('rejects invalid triples', () => {
    assert.equal(lookupTierReward('streak', 'normal', 20), null)
    // 'Easy' is a display label only — the stored difficulty is 'normal'.
    assert.equal(lookupTierReward('total_jumps', 'easy', 20), null)
    assert.equal(lookupTierReward('total_jumps', 'normal', 21), null)
    assert.equal(lookupTierReward('total_jumps', 'normal', '20'), null)
    assert.equal(lookupTierReward(undefined, 'normal', 20), null)
  })

  it('decides free ownership by explicit id, never by array index', () => {
    assert.equal(isFreeSkinId('bird2-1'), true)
    assert.equal(isFreeSkinId('bird2-7'), true)
    assert.equal(isFreeSkinId('kirkbird'), false)
    assert.equal(isFreeSkinId('redbirdsmall'), false)
    assert.equal(isFreeSkinId('no-such-skin'), false)
    assert.equal(isFreeSkinId(0), false)
    assert.equal(isFreeBackgroundId('background1'), true)
    assert.equal(isFreeBackgroundId('background3'), true)
    assert.equal(isFreeBackgroundId('background4'), false)
    assert.equal(isFreeBackgroundId(undefined), false)
  })
})
