/**
 * TEST-01 — unit tests for the game logic in engine.ts.
 *
 * engine.ts was kept DOM-free on purpose (input arrives as method calls, output
 * goes out through the renderer), so a whole run — gravity, the flap impulse,
 * pipe/ground/ceiling collision, scoring and the death animation — can be
 * driven frame by frame from Node with no browser, no emulator and no extra
 * dependency:
 *
 *   npm test
 *
 * Every case builds its world through the public API (createGameState /
 * startGame / flap / stepGame) and asserts behaviour rather than the tuning
 * constants: re-tuning gravity, the flap impulse or the terminal speed must not
 * break these tests, only a change in what the game does.
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  BIRD_R,
  BIRD_X,
  DEFAULT_VIEW_H,
  LOGICAL_W,
  PIPE_CAP_W,
  PIPE_COLOR_SCORE_STEP,
  PIPE_GAP,
  PIPE_SPACING,
  PIPE_SPEED,
  RESUME_COUNTDOWN_S,
  SPRITE_SCALE,
  birdFrame,
  birdHitsPipe,
  createGameState,
  deadBirds,
  drainEvents,
  flap,
  isCelebrating,
  advancePipePalette,
  floorTop,
  pauseGame,
  pipePalette,
  replayGame,
  resetGame,
  resumeGame,
  rotationForVelocity,
  runResult,
  startGame,
  stepGame,
  syncChallenge,
  type GameChallengeView,
  type GameState,
  type PipePair,
} from './engine.ts'

/** The loop's normal frame at 60 fps. */
const FRAME = 1 / 60

/**
 * The most world scroll a single step can produce: stepGame clamps dt to 50 ms,
 * so a backgrounded tab that resumes with a multi-second frame cannot jump.
 */
const MAX_FRAME_SCROLL = PIPE_SPEED * 0.05

/** Float comparison for values that accumulate over many frames. */
function closeTo(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  )
}

/** Steps the world `frames` times (60 fps unless another dt is given). */
function run(s: GameState, frames = 1, dt = FRAME): void {
  for (let i = 0; i < frames; i++) stepGame(s, dt)
}

interface Scenario {
  viewH?: number
  y?: number
  vy?: number
  score?: number
  pipes?: PipePair[]
  runTime?: number
  jumpCount?: number
}

/**
 * A state that is already mid-run: gravity and collision cases need the bird
 * and the pipes somewhere exact, not wherever a real start leaves them.
 */
function playing(scenario: Scenario = {}): GameState {
  const s = createGameState(scenario.viewH ?? DEFAULT_VIEW_H)
  startGame(s)
  if (scenario.y !== undefined) s.bird.y = scenario.y
  if (scenario.vy !== undefined) s.bird.vy = scenario.vy
  if (scenario.score !== undefined) s.score = scenario.score
  if (scenario.pipes !== undefined) s.pipes = scenario.pipes
  if (scenario.runTime !== undefined) s.runTime = scenario.runTime
  if (scenario.jumpCount !== undefined) s.jumpCount = scenario.jumpCount
  return s
}

/**
 * Steps physics and drops whatever pipe the world spawns, so the bird can fall
 * for seconds without a random gap height deciding the test.
 */
function runPhysics(s: GameState, frames: number): void {
  for (let i = 0; i < frames; i++) {
    stepGame(s, FRAME)
    s.pipes.length = 0
  }
}

/** A pipe pair whose cap overlaps the bird's x range, gap starting at gapTop. */
function pipeOverBird(gapTop: number): PipePair {
  return { x: BIRD_X - PIPE_CAP_W * SPRITE_SCALE, gapTop, passed: false }
}

/**
 * x at which a pipe's trailing cap has just cleared the bird: it scores on the
 * next frame and, at the same geometry, can no longer collide.
 */
const PASSED_X = BIRD_X - BIRD_R - PIPE_CAP_W * SPRITE_SCALE - 1

/** Ends the current run by dropping the bird onto the ground. */
function crashIntoGround(s: GameState): void {
  s.bird.y = floorTop(s) - BIRD_R - 1
  s.bird.vy = 50
  run(s, 1)
}

/** A run that has already played out: collision, death animation, game over. */
function finishedRun(): GameState {
  const s = playing()
  crashIntoGround(s)
  run(s, 120)
  return s
}

// The corpse store is module-level session memory (survives Play Again by
// design), so each test starts from an empty one.
beforeEach(() => {
  deadBirds.clear()
})

describe('createGameState / resetGame — start and restart', () => {
  it('starts ready with a hovering bird, no pipes and zeroed counters', () => {
    const s = createGameState()
    assert.equal(s.phase, 'ready')
    assert.equal(s.viewH, DEFAULT_VIEW_H)
    assert.deepEqual(s.pipes, [])
    assert.equal(s.score, 0)
    assert.equal(s.best, 0)
    assert.equal(s.runTime, 0)
    assert.equal(s.jumpCount, 0)
    assert.equal(s.scroll, 0)
    assert.equal(s.bird.vy, 0)
    assert.ok(s.bird.y < floorTop(s), 'the bird starts in the sky')
  })

  it('honours the measured view height', () => {
    const s = createGameState(900)
    assert.equal(s.viewH, 900)
    assert.equal(floorTop(s), 900 - 80)
    assert.ok(s.bird.y < floorTop(s))
  })

  it('clears the run but keeps the session best, the look and the view', () => {
    const s = playing({viewH: 800, score: 9})
    s.backgroundIndex = 3
    s.groundIndex = 2
    s.skinIndex = 5
    s.best = 12
    s.currentPipeColorIndex = 2
    s.lastPipeColorChangeScore = 20
    crashIntoGround(s)

    resetGame(s)

    assert.equal(s.phase, 'ready')
    assert.equal(s.viewH, 800, 'restarting keeps the current view height')
    assert.equal(s.score, 0)
    assert.equal(s.runTime, 0)
    assert.equal(s.jumpCount, 0)
    assert.equal(s.scroll, 0)
    assert.deepEqual(s.pipes, [])
    assert.equal(s.best, 12, 'the session best survives Play Again')
    // The player's chosen look must survive the restart too.
    assert.equal(s.backgroundIndex, 3)
    assert.equal(s.groundIndex, 2)
    assert.equal(s.skinIndex, 5)
    assert.equal(s.currentPipeColorIndex, 0)
    assert.equal(s.lastPipeColorChangeScore, 0)
  })

  it('starts a clean run on the first tap after Play Again', () => {
    const s = finishedRun()
    resetGame(s)
    flap(s)

    assert.equal(s.phase, 'playing')
    assert.equal(s.score, 0)
    assert.deepEqual(s.pipes, [])
    assert.equal(s.runTime, 0)
    assert.equal(s.jumpCount, 1)
    assert.ok(s.bird.vy < 0, 'the new run starts with an upward impulse')
  })
})

describe('flap — starting the run and jumping (GAME-02)', () => {
  it('starts the run on the first tap and counts it as jump #1', () => {
    const s = createGameState()
    flap(s)

    assert.equal(s.phase, 'playing')
    assert.equal(s.jumpCount, 1)
    assert.ok(s.bird.vy < 0, 'a flap pushes the bird upwards')
    assert.equal(s.bird.y, s.viewH / 2 - 40)
    assert.equal(s.bird.frameTime, 0, 'the wing animation restarts on the tap')
  })

  it('restores the same upward impulse on every jump mid-air', () => {
    const s = createGameState()
    flap(s)
    const impulse = s.bird.vy

    run(s, 20) // a third of a second of falling
    assert.ok(s.bird.vy > impulse, 'gravity has pulled the bird down since')

    flap(s)

    assert.equal(s.bird.vy, impulse, 'every flap gives the same impulse')
    assert.equal(s.jumpCount, 2)
    assert.equal(s.bird.frameTime, 0)
  })

  it('ignores taps once the collision has ended the run', () => {
    const s = playing()
    crashIntoGround(s)
    assert.equal(s.phase, 'dead')
    const deathVy = s.bird.vy
    const deathJumps = s.jumpCount

    flap(s)

    assert.equal(s.phase, 'dead')
    assert.equal(s.bird.vy, deathVy, 'no jump is accepted during the death fall')
    assert.equal(s.jumpCount, deathJumps)
  })

  it('ignores taps on the game-over screen', () => {
    const s = finishedRun()
    const before = {...s.bird}
    const jumps = s.jumpCount

    flap(s)

    assert.equal(s.phase, 'game-over')
    assert.deepEqual({...s.bird}, before)
    assert.equal(s.jumpCount, jumps)
  })
})

describe('gravity — the vertical physics (GAME-02)', () => {
  it('accelerates downwards, frame after frame', () => {
    const s = playing({viewH: 20_000, y: 200, vy: 0})
    const velocities: number[] = []
    for (let i = 0; i < 5; i++) {
      runPhysics(s, 1)
      velocities.push(s.bird.vy)
    }

    assert.ok(velocities[0] > 0, 'gravity starts pulling immediately')
    for (let i = 1; i < velocities.length; i++) {
      assert.ok(
        velocities[i] > velocities[i - 1],
        `velocity must keep growing: ${velocities[i - 1]} → ${velocities[i]}`,
      )
    }
  })

  it('makes the bird fall while the velocity is positive', () => {
    const s = playing({viewH: 20_000, y: 200, vy: 0})
    runPhysics(s, 10)
    assert.ok(s.bird.y > 200, 'a falling bird moves down the screen')
  })

  it('caps the fall speed at a terminal velocity', () => {
    const s = playing({viewH: 20_000, y: 200, vy: 0})
    runPhysics(s, 240) // long enough to reach the cap
    const terminal = s.bird.vy

    assert.ok(terminal > 0)
    runPhysics(s, 5)
    assert.equal(s.bird.vy, terminal, 'the fall speed stops growing at the cap')
    // Still falling at the cap, not frozen in place.
    const y = s.bird.y
    runPhysics(s, 5)
    assert.ok(s.bird.y > y)
  })

  it('clamps a long frame so a tab switch cannot teleport the world', () => {
    const s = playing()

    stepGame(s, 5)

    assert.ok(s.scroll > 0, 'the world still advances')
    closeTo(s.scroll, MAX_FRAME_SCROLL)
    closeTo(s.runTime, 0.05) // and the run timer no further
  })

  it('hovers on the ready screen without gravity or scrolling', () => {
    const s = createGameState()
    const startY = s.bird.y

    run(s, 30)

    assert.equal(s.phase, 'ready')
    assert.equal(s.bird.vy, 0, 'no gravity before the first tap')
    assert.equal(s.scroll, 0, 'the scenery only moves during a run')
    assert.equal(s.runTime, 0)
    assert.notEqual(s.bird.y, startY, 'the bird bobs while waiting')
    assert.ok(Math.abs(s.bird.y - startY) < 6.5, 'but stays where it started')
    assert.ok(s.bird.y < floorTop(s))
  })
})

describe('pipes — spawning and geometry (GAME-03)', () => {
  it('spawns the first pair fully off-screen', () => {
    const s = playing()
    run(s, 1)

    assert.equal(s.pipes.length, 1)
    assert.ok(s.pipes[0].x >= LOGICAL_W, 'no pipe may pop into view')
    assert.equal(s.pipes[0].passed, false)
  })

  it('keeps every gap inside the playable band, whatever the random draw', (t) => {
    let draw = 0
    t.mock.method(Math, 'random', () => draw)

    for (const value of [0, 0.25, 0.5, 0.999_999]) {
      draw = value
      const s = playing()
      run(s, 1)
      const pipe = s.pipes[0]

      assert.ok(pipe.gapTop >= BIRD_R, `gap starts above the ceiling (${value})`)
      assert.ok(
        pipe.gapTop + PIPE_GAP <= floorTop(s) - BIRD_R,
        `gap ends above the ground (${value})`,
      )
    }
  })

  it('waits for the spacing before releasing the next pair', () => {
    const first: PipePair = {
      x: LOGICAL_W - PIPE_SPACING + 5,
      gapTop: 200,
      passed: false,
    }
    const s = playing({pipes: [first]})

    run(s, 1)
    assert.equal(s.pipes.length, 1, 'still inside the spacing window')

    run(s, 4)
    assert.equal(s.pipes.length, 2, 'once past it, a new pair is released')
    assert.ok(
      s.pipes[1].x - s.pipes[0].x >= PIPE_SPACING,
      'and never closer than the spacing',
    )
  })

  it('leaves room for a bird between two pairs', () => {
    assert.ok(
      PIPE_SPACING > PIPE_CAP_W * SPRITE_SCALE,
      'the spacing must be wider than a whole pipe cap',
    )
  })

  it('drops a pair once its scaled cap has left the screen', () => {
    const gone: PipePair = {
      x: -PIPE_CAP_W * SPRITE_SCALE - 1,
      gapTop: 200,
      passed: true,
    }
    const s = playing({pipes: [gone]})

    run(s, 1)

    assert.ok(!s.pipes.includes(gone), 'the off-screen pair is dropped')
    for (const pipe of s.pipes) {
      assert.ok(pipe.x >= LOGICAL_W, 'only fully off-screen pairs remain')
    }
  })
})

describe('collision — ground, ceiling and pipes (GAME-03)', () => {
  it('ends the run on the ground and snaps the bird to the ground line', () => {
    const s = playing()
    crashIntoGround(s)

    assert.equal(s.phase, 'dead')
    assert.equal(s.bird.y, floorTop(s) - BIRD_R)
  })

  it('ends the run at the ceiling — flying off the top is fatal too', () => {
    const s = playing({y: BIRD_R + 1, vy: -100})

    run(s, 1)

    assert.equal(s.phase, 'dead')
    assert.equal(s.bird.y, BIRD_R)
  })

  it('ends the run on the pipe above the gap', () => {
    const gapTop = 220
    const s = playing({y: gapTop - BIRD_R - 5, vy: 0, pipes: [pipeOverBird(gapTop)]})
    assert.equal(birdHitsPipe(s, s.pipes[0]), true, 'the geometry must overlap')

    run(s, 1)

    assert.equal(s.phase, 'dead')
  })

  it('ends the run on the pipe below the gap', () => {
    const gapTop = 220
    const s = playing({
      y: gapTop + PIPE_GAP + BIRD_R + 5,
      vy: 0,
      pipes: [pipeOverBird(gapTop)],
    })

    run(s, 1)

    assert.equal(s.phase, 'dead')
  })

  it('flies through the same pipe when the bird is in the gap', () => {
    const gapTop = 220
    const s = playing({y: gapTop + PIPE_GAP / 2, vy: 0, pipes: [pipeOverBird(gapTop)]})

    run(s, 1)

    assert.equal(s.phase, 'playing')
    assert.equal(s.score, 0, 'the pair has not been passed yet')
  })

  it('treats an exact graze of the gap edge as a miss', () => {
    const gapTop = 220
    const s = playing({y: gapTop + BIRD_R, vy: 0})

    assert.equal(birdHitsPipe(s, pipeOverBird(gapTop)), false)
    s.bird.y = gapTop + PIPE_GAP - BIRD_R
    assert.equal(birdHitsPipe(s, pipeOverBird(gapTop)), false)
  })

  it('ignores pipes entirely ahead of or behind the bird', () => {
    const s = playing({y: 300})

    assert.equal(
      birdHitsPipe(s, {x: LOGICAL_W, gapTop: 100, passed: false}),
      false,
      'a pipe still off-screen cannot hit',
    )
    assert.equal(
      birdHitsPipe(s, {x: PASSED_X, gapTop: 100, passed: true}),
      false,
      'a pipe already behind the bird cannot hit either',
    )
  })

  it('can never kill the bird with a pipe it has already scored on', () => {
    const pipe: PipePair = {x: PASSED_X, gapTop: 400, passed: true}
    const s = playing({y: 100, vy: 0, pipes: [pipe]})

    assert.equal(birdHitsPipe(s, pipe), false)
    run(s, 1)

    assert.equal(s.phase, 'playing')
  })
})

describe('score — counting passed pipes (GAME-04)', () => {
  it('adds one point when a pair is fully behind the bird', () => {
    const pipe: PipePair = {x: PASSED_X, gapTop: 200, passed: false}
    const s = playing({pipes: [pipe]})

    run(s, 1)

    assert.equal(s.score, 1)
    assert.equal(pipe.passed, true, 'the pair is marked so it cannot count again')
  })

  it('never counts the same pair twice', () => {
    const s = playing({pipes: [{x: PASSED_X, gapTop: 200, passed: false}]})

    run(s, 1)
    assert.equal(s.score, 1)
    run(s, 10)

    assert.equal(s.score, 1)
  })

  it('does not score a pair that is still ahead of the bird', () => {
    const s = playing({pipes: [pipeOverBird(200)]})

    run(s, 3)

    assert.equal(s.score, 0)
  })

  it('counts every passed pair separately', () => {
    const s = playing({
      pipes: [
        {x: PASSED_X, gapTop: 200, passed: false},
        {x: PASSED_X - 5, gapTop: 200, passed: false},
      ],
    })

    run(s, 1)

    assert.equal(s.score, 2)
  })

  it('stops counting once the run is over', () => {
    const s = playing({score: 3})
    crashIntoGround(s)
    s.pipes = [{x: PASSED_X, gapTop: 200, passed: false}]

    run(s, 5)

    assert.equal(s.score, 3)
  })

  it('records the run as the best of the session, and keeps the higher one', () => {
    const s = playing({score: 7})
    crashIntoGround(s)
    assert.equal(s.best, 7)

    const worse = playing({score: 2})
    worse.best = 10
    crashIntoGround(worse)
    assert.equal(worse.best, 10, 'a weaker run must not lower the session best')
  })

  it('keeps scoring after Play Again from zero', () => {
    const s = playing({score: 5})
    crashIntoGround(s)
    run(s, 120)
    resetGame(s)
    flap(s)

    assert.equal(s.score, 0)
    s.pipes = [{x: PASSED_X, gapTop: 200, passed: false}]
    run(s, 1)

    assert.equal(s.score, 1)
    assert.equal(s.best, 5)
  })
})

describe('death animation and game over — GAME-03 / GAME-04', () => {
  it('freezes the world while the corpse falls', () => {
    const s = playing({score: 4})
    crashIntoGround(s)
    assert.equal(s.phase, 'dead')
    const frozen = {
      scroll: s.scroll,
      score: s.score,
      runTime: s.runTime,
      pipeXs: s.pipes.map((p) => p.x),
      pipeCount: s.pipes.length,
    }

    run(s, 10)

    assert.equal(s.phase, 'dead')
    assert.equal(s.scroll, frozen.scroll, 'no more scrolling during the fall')
    assert.equal(s.score, frozen.score)
    assert.equal(s.runTime, frozen.runTime, 'the run timer has stopped')
    assert.equal(s.pipes.length, frozen.pipeCount, 'no new pipes spawn')
    assert.deepEqual(s.pipes.map((p) => p.x), frozen.pipeXs, 'pipes stand still')
    assert.ok(s.bird.vy > 0, 'only the bird keeps moving')
  })

  it('never rotates past -180° while falling', () => {
    const s = playing()
    crashIntoGround(s)
    const startAngle = s.bird.angle

    for (let i = 0; i < 120; i++) {
      run(s, 1)
      assert.ok(
        s.bird.angle >= -Math.PI && s.bird.angle <= startAngle + 1e-12,
        `angle out of range at frame ${i}: ${s.bird.angle}`,
      )
      if (s.phase === 'game-over') break
    }
  })

  it('lands nose-down on the ground line and leaves a corpse where it died', () => {
    const s = playing({score: 2})
    s.skinIndex = 4
    crashIntoGround(s)
    const diedAt = s.scroll

    run(s, 120)

    assert.equal(s.phase, 'game-over')
    assert.equal(s.bird.y, floorTop(s), 'the bird is centred on the ground line')
    assert.equal(s.bird.angle, -Math.PI, 'exactly -180°')
    assert.equal(s.bird.vy, 0)

    assert.equal(deadBirds.size, 1)
    const corpse = deadBirds.all()[0]
    assert.equal(corpse.skinId, '4', 'the corpse keeps the skin it died with')
    assert.equal(corpse.rotation, -Math.PI)
    assert.equal(corpse.animationFinished, true)
    assert.equal(corpse.width, corpse.height)
    assert.equal(corpse.y, s.bird.y - corpse.height / 2)
    assert.equal(
      corpse.x,
      diedAt + BIRD_X - corpse.width / 2,
      'the corpse lies at the spot where the bird died',
    )
  })

  it('freezes the game-over screen and adds no second corpse', () => {
    const s = finishedRun()
    const frozen = {
      scroll: s.scroll,
      score: s.score,
      pipes: s.pipes.map((p) => p.x),
      bird: {...s.bird},
    }

    run(s, 30)

    assert.equal(s.phase, 'game-over')
    assert.equal(s.scroll, frozen.scroll)
    assert.equal(s.score, frozen.score)
    assert.deepEqual(s.pipes.map((p) => p.x), frozen.pipes)
    assert.deepEqual({...s.bird}, frozen.bird)
    assert.equal(deadBirds.size, 1, 'one death animation, one corpse')
  })

  it('remembers earlier corpses across Play Again', () => {
    const first = finishedRun()
    assert.equal(deadBirds.size, 1)

    resetGame(first)
    assert.equal(first.phase, 'ready')
    assert.equal(deadBirds.size, 1, 'the map is not swept on restart')

    flap(first)
    crashIntoGround(first)
    run(first, 120)

    assert.equal(first.phase, 'game-over')
    assert.equal(deadBirds.size, 2, 'corpses accumulate within the session')
    assert.notEqual(deadBirds.all()[0].id, deadBirds.all()[1].id)
  })
})

describe('runResult — the DATA-01 payload', () => {
  it('reports the score, the jumps and the played time in ms', () => {
    const s = playing()
    run(s, 30) // half a second of play
    s.score = 9
    flap(s)

    const result = runResult(s)

    assert.equal(result.score, 9)
    assert.equal(result.jumpCount, 2, 'the starting tap counts as a jump')
    assert.equal(result.durationMs, 500)
    assert.equal(Number.isInteger(result.durationMs), true)
  })

  it('counts time only while playing, not on the ready screen', () => {
    const s = createGameState()
    run(s, 60) // a second of hovering
    flap(s)
    run(s, 30)

    closeTo(s.time, 1.5, 1e-6) // the clock runs from the moment the page loads
    closeTo(s.runTime, 0.5, 1e-6) // the run timer only from the first tap
    assert.equal(runResult(s).durationMs, 500)
  })
})

describe('birdFrame — the four-frame flap cycle', () => {
  it('plays the whole cycle then settles on the glide frame', () => {
    const s = playing({viewH: 20_000, y: 200})
    const frames: number[] = []

    for (let i = 0; i < 90; i++) {
      // Keep the bird alive: this test is about the wing animation.
      s.bird.y = 200
      s.bird.vy = 0
      runPhysics(s, 1)
      frames.push(birdFrame(s))
    }

    for (const expected of [0, 1, 2, 3]) {
      assert.ok(frames.includes(expected), `frame ${expected} must be shown`)
    }
    assert.equal(birdFrame(s), 1, 'the wing settles on the glide frame')
    assert.equal(s.bird.frameTime >= 600, true, 'after a full 600ms cycle')
  })

  it('loops forever on the ready screen', () => {
    const s = createGameState()
    const frames = new Set<number>()

    for (let i = 0; i < 150; i++) {
      run(s, 1)
      frames.add(birdFrame(s))
    }

    assert.deepEqual([...frames].sort(), [0, 1, 2, 3])
  })

  it('freezes on the glide frame once the bird is dead', () => {
    const s = playing()
    crashIntoGround(s)

    assert.equal(s.phase, 'dead')
    assert.equal(birdFrame(s), 1)

    run(s, 120)
    assert.equal(s.phase, 'game-over')
    assert.equal(birdFrame(s), 1)
  })

  it('restarts the cycle on every jump', () => {
    const s = playing({viewH: 20_000, y: 200})
    runPhysics(s, 20)
    assert.notEqual(birdFrame(s), 0)

    flap(s)

    assert.equal(birdFrame(s), 0, 'a jump replays the cycle from the first frame')
  })
})

describe('pipe palette — GAME-05 palette rotation', () => {
  it('stays on the first palette without any palettes to rotate to', () => {
    const s = playing()
    s.score = PIPE_COLOR_SCORE_STEP * 3

    advancePipePalette(s, 0)

    assert.equal(pipePalette(s, 0), 0)
  })

  it('does not rotate inside the same score bracket', () => {
    const s = playing()
    s.score = PIPE_COLOR_SCORE_STEP - 1
    const lastChange = s.lastPipeColorChangeScore

    advancePipePalette(s, 4)

    assert.equal(pipePalette(s, 4), 0)
    assert.equal(s.currentPipeColorIndex, 0)
    assert.equal(s.lastPipeColorChangeScore, lastChange)
  })

  it('rotates once when the score enters a new bracket', (t) => {
    const s = playing()
    s.time = 5
    // The draw lands on the palette already on screen (0.25 → index 1 of 4),
    // so a correct rotation moves to the next one instead of re-using it.
    t.mock.method(Math, 'random', () => 0.25)

    s.currentPipeColorIndex = 1
    s.score = PIPE_COLOR_SCORE_STEP

    advancePipePalette(s, 4)

    assert.equal(pipePalette(s, 4), 2)
    assert.equal(s.currentPipeColorIndex, 2)
    assert.equal(s.previousPipeColorIndex, 1, 'the outgoing palette is remembered')
    assert.equal(s.colorSwapAt, 5, 'so the renderer can cross-fade from it')
    assert.equal(s.lastPipeColorChangeScore, s.score)
  })

  it('does not rotate again while the bracket stays the same', (t) => {
    const s = playing()
    t.mock.method(Math, 'random', () => 0.75)
    s.score = PIPE_COLOR_SCORE_STEP

    advancePipePalette(s, 4)
    const first = pipePalette(s, 4)
    advancePipePalette(s, 4)
    const second = pipePalette(s, 4)

    assert.equal(second, first)
  })

  it('has nothing to rotate to with a single palette', () => {
    const s = playing()
    s.score = PIPE_COLOR_SCORE_STEP * 2

    advancePipePalette(s, 1)

    assert.equal(pipePalette(s, 1), 0)
  })
})

describe('rotationForVelocity — the visual tilt', () => {
  it('noses up on the flap impulse and noses right at terminal speed', () => {
    const s = createGameState()
    flap(s)
    const impulse = s.bird.vy

    const rising = rotationForVelocity(impulse)
    const falling = rotationForVelocity(1e6)

    assert.ok(rising < 0, 'nose up while rising')
    assert.ok(falling > 0, 'nose right while falling')
    assert.ok(falling > rising)
    assert.ok(Math.abs(rising) <= 0.5 && Math.abs(falling) <= 0.5, 'subtle tilt only')
  })

  it('clamps outside the flight range and grows with the fall speed', () => {
    const impulse = (() => {
      const s = createGameState()
      flap(s)
      return s.bird.vy
    })()

    assert.equal(rotationForVelocity(impulse - 1000), rotationForVelocity(impulse))
    assert.equal(rotationForVelocity(1e6), rotationForVelocity(1e5))
    assert.ok(rotationForVelocity(100) < rotationForVelocity(500))
  })
})

describe('syncChallenge — best/progress copy + the completion banner (C)', () => {
  /** A GamePage view of one active challenge with the given progress. */
  const viewAt = (
    value: number,
    target: number,
    serverBest = 0,
  ): { serverBest: number; challenge: GameChallengeView } => ({
    serverBest,
    challenge: {
      id: 'c1',
      title: 'Score 10',
      value,
      target,
      // GamePage never claims a celebration — the engine derives it.
      celebrate: false,
      celebrateAt: 0,
    },
  })

  it('copies the best and the challenge numbers into the frozen state', () => {
    const s = createGameState()
    syncChallenge(s, viewAt(4, 10, 13))
    assert.equal(s.serverBest, 13)
    assert.equal(s.challenge?.value, 4)
    assert.equal(s.challenge?.target, 10)
    assert.equal(s.challenge?.celebrate, false)
  })

  it('clears the block when the view has no challenge', () => {
    const s = createGameState()
    syncChallenge(s, viewAt(4, 10))
    syncChallenge(s, { serverBest: 13, challenge: null })
    assert.equal(s.challenge, null)
    assert.equal(s.serverBest, 13)
  })

  it('does not celebrate a challenge that arrives already finished', () => {
    const s = createGameState()
    syncChallenge(s, viewAt(10, 10))
    assert.equal(s.challenge?.celebrate, false)
    assert.equal(isCelebrating(s), false)
  })

  it('celebrates exactly the update that crosses the target', () => {
    const s = createGameState()
    syncChallenge(s, viewAt(9, 10))
    s.time = 42 // the frozen game-over clock
    syncChallenge(s, viewAt(10, 10))
    assert.equal(s.challenge?.celebrate, true)
    assert.equal(s.challenge?.celebrateAt, 42)
    assert.equal(isCelebrating(s), true)
    // Later refreshes of the same, finished challenge keep the state.
    syncChallenge(s, viewAt(11, 10))
    assert.equal(s.challenge?.value, 11)
    assert.equal(s.challenge?.celebrate, true)
    assert.equal(s.challenge?.celebrateAt, 42)
  })

  it('ends the celebration for the next run — "Play Again" keeps the numbers', () => {
    const s = createGameState()
    syncChallenge(s, viewAt(9, 10))
    syncChallenge(s, viewAt(10, 10))
    assert.equal(isCelebrating(s), true)
    resetGame(s)
    assert.equal(s.challenge?.value, 10)
    assert.equal(s.challenge?.celebrate, false)
    assert.equal(isCelebrating(s), false)
  })

  it('a new challenge id starts fresh, with no banner', () => {
    const s = createGameState()
    syncChallenge(s, viewAt(10, 10))
    const next = viewAt(10, 10)
    next.challenge = { ...next.challenge, id: 'c2', title: 'Play 5 games' }
    syncChallenge(s, next)
    assert.equal(s.challenge?.id, 'c2')
    assert.equal(s.challenge?.celebrate, false)
  })
})

describe('pause / resume countdown / play again — PAUSE', () => {
  /**
   * A live run, airborne, with a pipe ahead and a score on the board. The pipe
   * is placed by hand instead of waiting for a real spawn: the pause tests need
   * a world that is guaranteed NOT to be mid-collision when they start, and a
   * far-away pipe never overlaps the bird.
   */
  function liveRun(): GameState {
    const s = createGameState()
    flap(s) // ready → playing
    run(s, 20) // half a second in — still climbing, nothing in the way
    assert.equal(s.phase, 'playing')
    s.pipes = [{ x: 340, gapTop: 120, passed: false }]
    s.score = 4
    return s
  }

  it('freezes the whole run — bird, pipes, clock and score', () => {
    const s = liveRun()
    drainEvents(s) // the starting flap, already reported before the pause
    const frozen = {
      y: s.bird.y,
      vy: s.bird.vy,
      angle: s.bird.angle,
      score: s.score,
      runTime: s.runTime,
      pipes: s.pipes.map((p) => ({ x: p.x, gapTop: p.gapTop })),
    }
    pauseGame(s)
    assert.equal(s.phase, 'paused')
    run(s, 120) // two seconds of frames
    assert.equal(s.bird.y, frozen.y)
    assert.equal(s.bird.vy, frozen.vy)
    assert.equal(s.bird.angle, frozen.angle)
    assert.equal(s.score, frozen.score)
    assert.equal(s.runTime, frozen.runTime)
    assert.deepEqual(
      s.pipes.map((p) => ({ x: p.x, gapTop: p.gapTop })),
      frozen.pipes,
    )
    // Nothing that happened while paused is reported as a sound.
    assert.deepEqual(drainEvents(s), [])
  })

  it('ignores pause outside a live run', () => {
    const ready = createGameState()
    pauseGame(ready)
    assert.equal(ready.phase, 'ready')

    const over = liveRun()
    startGame(over)
    over.phase = 'game-over'
    pauseGame(over)
    assert.equal(over.phase, 'game-over')

    const dying = liveRun()
    dying.phase = 'dead'
    pauseGame(dying)
    assert.equal(dying.phase, 'dead')
  })

  it('goes through a 3-2-1 countdown before the run continues', () => {
    const s = liveRun()
    const frozenY = s.bird.y
    const frozenScore = s.score
    const frozenTime = s.runTime
    const frozenPipes = s.pipes.map((p) => p.x)
    pauseGame(s)
    resumeGame(s)
    assert.equal(s.phase, 'countdown')
    closeTo(s.countdownLeft, RESUME_COUNTDOWN_S, 1e-9)

    // One frame in: the countdown ticks, the world does not.
    run(s, 1)
    assert.equal(s.phase, 'countdown')
    closeTo(s.countdownLeft, RESUME_COUNTDOWN_S - FRAME, 1e-6)
    assert.equal(s.bird.y, frozenY)
    assert.equal(s.score, frozenScore)

    // Count almost the whole window: 3 s of frames, not one pixel of movement.
    run(s, Math.round(RESUME_COUNTDOWN_S / FRAME) - 10)
    assert.equal(s.phase, 'countdown')
    assert.equal(s.bird.y, frozenY)
    assert.equal(s.score, frozenScore)
    assert.deepEqual(
      s.pipes.map((p) => p.x),
      frozenPipes,
    )
    assert.equal(s.runTime, frozenTime)

    // The last frames flip back to the SAME run — nothing was reset. Stepped
    // one at a time because the tick accumulates float error.
    let guard = 40
    while (s.phase === 'countdown' && guard-- > 0) run(s, 1)
    assert.equal(s.phase, 'playing')
    assert.equal(s.score, frozenScore)
    assert.equal(s.runTime, frozenTime)

    // …and gravity is back: the bird moves on the next frame.
    run(s, 1)
    assert.notEqual(s.bird.y, frozenY)
  })

  it('ignores flap input while paused and during the countdown', () => {
    const s = liveRun()
    pauseGame(s)
    const vy = s.bird.vy
    flap(s)
    assert.equal(s.bird.vy, vy)
    resumeGame(s)
    flap(s)
    assert.equal(s.bird.vy, vy)
    assert.equal(s.phase, 'countdown')
  })

  it('resumeGame only exits the pause screen', () => {
    const s = liveRun()
    resumeGame(s) // still playing — no countdown from mid-air
    assert.equal(s.phase, 'playing')
    pauseGame(s)
    resumeGame(s)
    assert.equal(s.phase, 'countdown')
    resumeGame(s) // a second press cannot restart the countdown window
    assert.equal(s.phase, 'countdown')
  })

  it('Play again starts a FRESH run after the countdown', () => {
    const s = liveRun()
    s.score = 7
    s.runTime = 12
    pauseGame(s)
    replayGame(s)
    assert.equal(s.phase, 'countdown')
    assert.equal(s.score, 0) // reset immediately, shown behind the 3-2-1
    assert.deepEqual(s.pipes, [])

    run(s, Math.round(RESUME_COUNTDOWN_S / FRAME) + 1)
    assert.equal(s.phase, 'playing')
    assert.equal(s.score, 0)
    assert.equal(s.runTime, 0)
    // The starting flap is part of the reset run (same as a first tap).
    assert.ok(drainEvents(s).includes('flap'))
  })

  it('replayGame only works from the pause screen', () => {
    const ready = createGameState()
    replayGame(ready)
    assert.equal(ready.phase, 'ready')
    const s = liveRun()
    const score = s.score
    replayGame(s) // mid-air: ignored
    assert.equal(s.phase, 'playing')
    assert.equal(s.score, score)
  })

  it('the countdown gives no run result and no death', () => {
    const s = liveRun()
    pauseGame(s)
    resumeGame(s)
    s.bird.y = floorTop(s) + 100 // even buried in the ground…
    run(s, Math.round(RESUME_COUNTDOWN_S / FRAME) - 2)
    assert.equal(s.phase, 'countdown') // …nothing collides during the countdown
    s.bird.y = s.viewH / 2 // put it back before play resumes
    run(s, 4)
    assert.equal(s.phase, 'playing')
  })
})
