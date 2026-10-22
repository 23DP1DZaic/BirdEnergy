/**
 * ECON-01 — client-side economy contract.
 *
 * The UI renders free/paid state from these constants, so the tests pin the
 * explicit free lists (ownership must never depend on an array index computed
 * at runtime), the catalog order that the sprite manifests rely on, the coin
 * prices and the id ↔ sprite-index mapping.
 *
 *   npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BACKGROUND_IDS,
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_TYPES,
  DAILY_CHALLENGE_COUNT,
  DEFAULT_BACKGROUND_ID,
  DEFAULT_BACKGROUND_INDEX,
  DEFAULT_SKIN_ID,
  DEFAULT_SKIN_INDEX,
  ECONOMY_VERSION,
  FREE_BACKGROUND_IDS,
  FREE_SKIN_IDS,
  PAID_BACKGROUND_PRICE_COINS,
  PAID_SKIN_PRICE_COINS,
  SKIN_IDS,
  backgroundIdForIndex,
  backgroundIndexForId,
  backgroundPriceCoins,
  isFreeBackground,
  isFreeSkin,
  skinIdForIndex,
  skinIndexForId,
  skinPriceCoins,
} from './economy.ts'

describe('ECON-01 — challenge types', () => {
  it('lists exactly the four supported types', () => {
    assert.deepEqual([...CHALLENGE_TYPES], [
      'total_jumps',
      'games_played',
      'single_game_score',
      'total_score',
    ])
  })

  it('stores difficulty as normal/hard ("Easy" is a display label)', () => {
    assert.deepEqual([...CHALLENGE_DIFFICULTIES], ['normal', 'hard'])
  })

  it('assigns exactly three challenges a day', () => {
    assert.equal(DAILY_CHALLENGE_COUNT, 3)
  })

  it('matches the server economy version', () => {
    // Must mirror functions/src/economy.ts.
    assert.equal(ECONOMY_VERSION, 1)
  })
})

describe('ECON-01 — cosmetic catalog', () => {
  it('keeps the skin ids in the birdSkinUrls order', () => {
    assert.deepEqual([...SKIN_IDS], [
      'classic-1',
      'classic-2',
      'classic-3',
      'classic-4',
      'classic-5',
      'classic-6',
      'classic-7',
      'kirk',
      'litvin',
      'mell',
    ])
  })

  it('keeps the background ids in the backgrounds order', () => {
    assert.deepEqual([...BACKGROUND_IDS], [
      'sky-1',
      'sky-2',
      'sky-3',
      'sky-4',
      'sky-5',
      'sky-6',
      'sky-7',
      'sky-8',
      'sky-9',
      'sky-10',
    ])
  })

  it('pins the 7 free skins explicitly', () => {
    assert.deepEqual([...FREE_SKIN_IDS], [
      'classic-1',
      'classic-2',
      'classic-3',
      'classic-4',
      'classic-5',
      'classic-6',
      'classic-7',
    ])
    assert.equal(FREE_SKIN_IDS.length, 7)
    for (const id of FREE_SKIN_IDS) {
      assert.ok(SKIN_IDS.includes(id), `${id} is not in the catalog`)
    }
  })

  it('pins the 3 free backgrounds explicitly', () => {
    assert.deepEqual([...FREE_BACKGROUND_IDS], ['sky-1', 'sky-2', 'sky-3'])
    assert.equal(FREE_BACKGROUND_IDS.length, 3)
    for (const id of FREE_BACKGROUND_IDS) {
      assert.ok(BACKGROUND_IDS.includes(id), `${id} is not in the catalog`)
    }
  })

  it('selects the free ids from the existing catalog order, once', () => {
    assert.deepEqual([...FREE_SKIN_IDS], SKIN_IDS.slice(0, 7))
    assert.deepEqual([...FREE_BACKGROUND_IDS], BACKGROUND_IDS.slice(0, 3))
  })

  it('marks only listed ids as free', () => {
    assert.equal(isFreeSkin('classic-7'), true)
    assert.equal(isFreeSkin('kirk'), false)
    assert.equal(isFreeSkin('mell'), false)
    assert.equal(isFreeSkin('ghost'), false)
    assert.equal(isFreeBackground('sky-3'), true)
    assert.equal(isFreeBackground('sky-4'), false)
    assert.equal(isFreeBackground('ghost'), false)
  })
})

describe('ECON-01 — cosmetic prices', () => {
  it('charges 500 for a paid skin and 1000 for a paid background', () => {
    assert.equal(PAID_SKIN_PRICE_COINS, 500)
    assert.equal(PAID_BACKGROUND_PRICE_COINS, 1000)
  })

  it('prices free cosmetics at 0 and paid ones at the flat price', () => {
    for (const id of SKIN_IDS) {
      const expected = FREE_SKIN_IDS.includes(id) ? 0 : 500
      assert.equal(skinPriceCoins(id), expected, id)
    }
    for (const id of BACKGROUND_IDS) {
      const expected = FREE_BACKGROUND_IDS.includes(id) ? 0 : 1000
      assert.equal(backgroundPriceCoins(id), expected, id)
    }
  })

  it('returns null for an unknown cosmetic id', () => {
    assert.equal(skinPriceCoins('ghost'), null)
    assert.equal(skinPriceCoins(null), null)
    assert.equal(backgroundPriceCoins('ghost'), null)
    assert.equal(backgroundPriceCoins(3), null)
  })
})

describe('ECON-01 — id ↔ sprite index mapping', () => {
  it('maps every id to its catalog position and back', () => {
    SKIN_IDS.forEach((id, index) => {
      assert.equal(skinIndexForId(id), index)
      assert.equal(skinIdForIndex(index), id)
    })
    BACKGROUND_IDS.forEach((id, index) => {
      assert.equal(backgroundIndexForId(id), index)
      assert.equal(backgroundIdForIndex(index), id)
    })
  })

  it('rejects unknown ids and out-of-range indices', () => {
    assert.equal(skinIndexForId('ghost'), null)
    assert.equal(skinIdForIndex(-1), null)
    assert.equal(skinIdForIndex(SKIN_IDS.length), null)
    assert.equal(skinIdForIndex(1.5), null)
    assert.equal(backgroundIndexForId('ghost'), null)
    assert.equal(backgroundIdForIndex(BACKGROUND_IDS.length), null)
  })

  it('defaults to a free cosmetic at the catalog start', () => {
    assert.equal(DEFAULT_SKIN_ID, 'classic-1')
    assert.equal(DEFAULT_SKIN_INDEX, 0)
    assert.equal(DEFAULT_BACKGROUND_ID, 'sky-1')
    assert.equal(DEFAULT_BACKGROUND_INDEX, 0)
    assert.equal(isFreeSkin(DEFAULT_SKIN_ID), true)
    assert.equal(isFreeBackground(DEFAULT_BACKGROUND_ID), true)
  })
})
