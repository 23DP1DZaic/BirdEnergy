/**
 * CH-06 — the Daily Challenges presentation layer, unit-tested in Node.
 *
 * These are the rules the screen must never get wrong:
 *   - the bar is clamped to 0–100% while the number beside it may exceed the
 *     target,
 *   - a completed challenge past `expiresAt` is EXPIRED, not claimable,
 *   - a claimed challenge stays claimed after expiry,
 *   - the section always reads Easy, Easy, Hard,
 *   - the countdown covers the 25-hour autumn DST day and reads 00:00:00 at
 *     the reset instead of going negative.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DAILY_TITLE_KEY,
  DIFFICULTY_LABEL_KEY,
  challengeProgressPct,
  claimState,
  formatCountdown,
  orderDailyAssignments,
  remainingMs,
} from './dailyChallengeUi.ts'

const NOW = Date.parse('2026-10-25T12:00:00Z')

describe('challengeProgressPct — clamped bar width', () => {
  it('reports the exact percentage below the target', () => {
    assert.equal(challengeProgressPct(20, 40), 50)
    assert.equal(challengeProgressPct(0, 40), 0)
    assert.equal(challengeProgressPct(1, 3), 33)
  })

  it('caps an overshooting total at 100 while progress may exceed it', () => {
    assert.equal(challengeProgressPct(97, 40), 100)
    assert.equal(challengeProgressPct(130, 130), 100)
    assert.equal(challengeProgressPct(500, 100), 100)
  })

  it('degrades to 0 for unusable values instead of NaN widths', () => {
    for (const [progress, target] of [
      [Number.NaN, 10],
      [10, 0],
      [10, -5],
      ['10', 10],
      [null, 10],
      [10, undefined],
    ] as const) {
      assert.equal(challengeProgressPct(progress, target), 0)
    }
  })
})

describe('remainingMs + formatCountdown — until the Riga reset', () => {
  it('formats hours, minutes and seconds', () => {
    assert.equal(formatCountdown(0), '00:00:00')
    assert.equal(formatCountdown(59_999), '00:00:59')
    assert.equal(formatCountdown(61_000), '00:01:01')
    assert.equal(formatCountdown(4 * 3_600_000 + 9 * 60_000 + 31_000), '04:09:31')
  })

  it('does not wrap at 24 hours (the autumn DST day is 25h)', () => {
    assert.equal(formatCountdown(25 * 3_600_000), '25:00:00')
  })

  it('never counts below zero or from an unreadable timestamp', () => {
    assert.equal(remainingMs('2026-10-25T11:00:00Z', NOW), 0)
    assert.equal(formatCountdown(remainingMs('2026-10-25T11:00:00Z', NOW)), '00:00:00')
    assert.equal(remainingMs('not-a-date', NOW), 0)
    assert.equal(formatCountdown(-1), '00:00:00')
  })

  it('measures a real window exactly', () => {
    assert.equal(remainingMs('2026-10-25T16:30:00Z', NOW), 4.5 * 3_600_000)
  })
})

describe('claimState — reward UI states', () => {
  const expiresAt = '2026-10-25T21:00:00Z'

  it('offers Claim only for a completed, unexpired, unclaimed row', () => {
    assert.equal(claimState({ completed: true, claimedAt: null }, expiresAt, NOW), 'ready')
  })

  it('disables an incomplete row', () => {
    assert.equal(
      claimState({ completed: false, claimedAt: null }, expiresAt, NOW),
      'incomplete',
    )
  })

  it('reports Expired at and after the reset, even when completed', () => {
    const atExpiry = Date.parse(expiresAt)
    assert.equal(claimState({ completed: true, claimedAt: null }, expiresAt, atExpiry), 'expired')
    assert.equal(
      claimState({ completed: true, claimedAt: null }, expiresAt, atExpiry + 1),
      'expired',
    )
  })

  it('keeps a claimed row claimed after expiry', () => {
    assert.equal(
      claimState(
        { completed: true, claimedAt: '2026-10-25T13:00:00Z' },
        expiresAt,
        Date.parse(expiresAt) + 60_000,
      ),
      'claimed',
    )
  })

  it('still shows Claimed while the day is running (no double claim)', () => {
    assert.equal(
      claimState(
        { completed: true, claimedAt: '2026-10-25T13:00:00Z' },
        expiresAt,
        NOW,
      ),
      'claimed',
    )
  })
})

describe('orderDailyAssignments — Easy, Easy, Hard', () => {
  it('puts the two normal rows before the hard one', () => {
    const ordered = orderDailyAssignments([
      { id: 'hard', difficulty: 'hard' },
      { id: 'easy-a', difficulty: 'normal' },
      { id: 'easy-b', difficulty: 'normal' },
    ])
    assert.deepEqual(
      ordered.map((row) => row.id),
      ['easy-a', 'easy-b', 'hard'],
    )
  })

  it('is stable and does not mutate the input', () => {
    const input = [
      { id: 'easy-a', difficulty: 'normal' },
      { id: 'easy-b', difficulty: 'normal' },
    ]
    assert.deepEqual(
      orderDailyAssignments(input).map((row) => row.id),
      ['easy-a', 'easy-b'],
    )
    assert.deepEqual(
      input.map((row) => row.id),
      ['easy-a', 'easy-b'],
    )
  })
})

describe('label keys', () => {
  it('displays the stored "normal" difficulty as Easy', () => {
    assert.equal(DIFFICULTY_LABEL_KEY.normal, 'difficulty.easy')
    assert.equal(DIFFICULTY_LABEL_KEY.hard, 'difficulty.hard')
  })

  it('has a title key for every supported challenge type', () => {
    assert.deepEqual(Object.keys(DAILY_TITLE_KEY).sort(), [
      'games_played',
      'single_game_score',
      'total_jumps',
      'total_score',
    ])
  })
})
