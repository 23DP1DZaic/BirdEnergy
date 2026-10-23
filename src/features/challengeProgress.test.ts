/**
 * TEST-01-style unit tests for the pure challenge progress logic (CH-01).
 *
 * challengeProgress.ts is deliberately free of Firebase/React imports so the
 * whole computation — window filtering, both challenge types and the cap at
 * the target — runs in Node with no browser or emulator:
 *
 *   npm test
 *
 * The cap is the regression this file exists for: a finished challenge must
 * read 2/2 or 100/100, never 4/2 or 101/100 (the bar percentage was always
 * capped; the number now matches it).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeProgress,
  type Challenge,
  type ChallengeType,
  type GameRun,
} from './challengeProgress.ts'

const START = new Date('2026-10-01T00:00:00Z')
const END = new Date('2026-10-31T23:59:59Z')

function challenge(
  type: ChallengeType,
  targetValue: number,
): Challenge {
  return {
    id: 'c1',
    title: 'Test challenge',
    description: 'For unit tests',
    type,
    targetValue,
    startDate: START,
    endDate: END,
  }
}

/** A run `day` days after the window start, with the given score. */
function run(day: number, score: number): GameRun {
  return { score, createdAt: new Date(START.getTime() + day * 86400000) }
}

describe('computeProgress — window filtering (CH-01 DoD)', () => {
  it('counts only runs inside the challenge window', () => {
    const runs = [
      run(-1, 5), // before the start
      run(1, 3),
      run(2, 9),
      run(60, 99), // after the end
    ]
    const p = computeProgress(challenge('games_played', 4), runs)
    assert.equal(p.value, 2)
    assert.equal(p.target, 4)
    assert.equal(p.done, false)
  })

  it('takes the best single-game score inside the window', () => {
    const runs = [run(1, 5), run(3, 12), run(5, 9)]
    const p = computeProgress(challenge('single_game_score', 20), runs)
    assert.equal(p.value, 12)
    assert.equal(p.done, false)
    assert.equal(p.pct, 60)
  })

  it('is zero with no runs', () => {
    const p = computeProgress(challenge('games_played', 3), [])
    assert.equal(p.value, 0)
    assert.equal(p.pct, 0)
    assert.equal(p.done, false)
  })
})

describe('computeProgress — the four ECON-01 types (CH-04)', () => {
  it('sums score for total_score inside the window', () => {
    const runs = [run(1, 5), run(3, 12), run(5, 9), run(60, 100)]
    const p = computeProgress(challenge('total_score', 40), runs)
    assert.equal(p.value, 26) // 5 + 12 + 9; the after-window run is excluded
    assert.equal(p.done, false)
  })

  it('caps total_score at the target (60/40 reads as 40/40)', () => {
    const p = computeProgress(challenge('total_score', 40), [run(1, 30), run(2, 30)])
    assert.equal(p.value, 40)
    assert.equal(p.pct, 100)
    assert.equal(p.done, true)
  })

  it('sums jumpCount for total_jumps; a missing count counts as 0', () => {
    const runs = [
      { ...run(1, 999), jumpCount: 7 },
      { ...run(2, 0), jumpCount: 8 },
      { ...run(3, 0) }, // legacy run stored before jumpCount existed
      { ...run(60, 0), jumpCount: 50 }, // outside the window
    ]
    const p = computeProgress(challenge('total_jumps', 40), runs)
    assert.equal(p.value, 15)
    assert.equal(p.done, false)
  })

  it('caps total_jumps at the target (90/60 reads as 60/60)', () => {
    const p = computeProgress(challenge('total_jumps', 60), [
      { ...run(1, 0), jumpCount: 40 },
      { ...run(2, 0), jumpCount: 50 },
    ])
    assert.equal(p.value, 60)
    assert.equal(p.pct, 100)
    assert.equal(p.done, true)
  })
})

describe('computeProgress — the value stops at the target', () => {
  it('caps games_played at the target (4/2 reads as 2/2)', () => {
    const runs = [run(1, 0), run(2, 0), run(3, 0), run(4, 0)]
    const p = computeProgress(challenge('games_played', 2), runs)
    assert.equal(p.value, 2)
    assert.equal(p.target, 2)
    assert.equal(p.pct, 100)
    assert.equal(p.done, true)
  })

  it('caps a beaten score at the target (101/100 reads as 100/100)', () => {
    const runs = [run(1, 101)]
    const p = computeProgress(challenge('single_game_score', 100), runs)
    assert.equal(p.value, 100)
    assert.equal(p.target, 100)
    assert.equal(p.pct, 100)
    assert.equal(p.done, true)
  })

  it('keeps a target of 1 exact (one game is 1/1, not 2/1)', () => {
    const runs = [run(1, 0), run(2, 0)]
    const p = computeProgress(challenge('games_played', 1), runs)
    assert.equal(p.value, 1)
    assert.equal(p.done, true)
  })

  it('crosses the target exactly once: below -> exactly the target', () => {
    // The Game Over panel derives its celebration from this crossing
    // (engine syncChallenge), so the capped value must REACH the target
    // and never skip past it.
    const two = computeProgress(challenge('games_played', 2), [run(1, 0), run(2, 0)])
    const three = computeProgress(challenge('games_played', 2), [run(1, 0), run(2, 0), run(3, 0)])
    assert.ok(two.value < two.target || two.value === two.target)
    assert.equal(three.value, two.value)
    assert.equal(three.value, two.target)
  })
})
