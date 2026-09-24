// GAME-01 — canvas game engine.
//
// Pure TypeScript: no DOM here — input arrives as method calls and all output
// goes through the renderer into any CanvasRenderingContext2D. That keeps the
// React wrapper thin and makes physics testable without a browser (TEST-01
// targets gravity/jump/collision/score).
//
// The world is a fixed 480 logical px wide; the view height adapts to the
// container (state.viewH) so the game fills the screen exactly like the Home
// page does — sky above, 80px ground band at the bottom, no letterboxing.
//
// Scope per backlog card: GAME-01 delivered rendering + the loop; gravity/jump
// feel is tuned in GAME-02; GAME-03 adds pipe-pair collision (ground AND
// ceiling contact already ended the run); score persistence is GAME-04.

/** Logical world width — CSS scales the canvas; sprites stay 1:1 world px. */
export const LOGICAL_W = 480
export const FLOOR_H = 80
/** Default view height (tests / before the first resize measurement). */
export const DEFAULT_VIEW_H = 640

/** Physics constants (logical px, seconds). Tuned further in GAME-02. */
const GRAVITY = 1400
const FLAP_VELOCITY = -420
const MAX_FALL_SPEED = 650

/**
 * Visual (render-only) scale for the bird and pipes: logical/world coordinates
 * stay 1:1 with the source art, and the renderer draws every game object
 * SPRITE_SCALE× bigger with nearest-neighbour so the pixel art stays crisp.
 * Spawn/despawn margins below use it too, so scaled sprites never pop in or
 * out while still on screen.
 */
export const SPRITE_SCALE = 3

/** World constants. */
export const PIPE_SPEED = 130
export const PIPE_SPACING = 240
export const PIPE_GAP = 150
export const PIPE_CAP_W = 32
export const PIPE_CAP_H = 20
export const BIRD_X = 120
/**
 * Bird collision radius. The sprite is drawn at SPRITE_SCALE (48px) for classic
 * flappy proportions; the radius is kept near the art's original half-size so
 * the hitbox stays fair while the bird reads much bigger on screen. GAME-03
 * reuses this for pipe collisions.
 */
export const BIRD_R = 13
const FLAP_FRAME_MS = 120

/** Gap spawn bounds relative to the current view: 60px sky margin above the
 *  gap, 30px floor margin below it. */
const GAP_TOP_MIN = 60

export type GamePhase = 'ready' | 'playing' | 'game-over'

export interface BirdState {
  /** Vertical center of the bird in logical px. */
  y: number
  vy: number
  /** Accumulated ms — drives the 4-frame flap animation. */
  frameTime: number
}

export interface PipePair {
  /** Left edge of the pipe (cap) in logical px. */
  x: number
  /** Top of the gap in logical px. */
  gapTop: number
  passed: boolean
}

export interface GameState {
  phase: GamePhase
  bird: BirdState
  pipes: PipePair[]
  score: number
  /** Total world scroll — drives sky/ground parallax. */
  scroll: number
  time: number
  /** Logical view height (follows the container, >= ~2 screens worth of sky). */
  viewH: number
  /** Which Home sky to draw (index into the shared 9-background list). */
  backgroundIndex: number
}

/** Top edge of the ground band for the current view. */
export function floorTop(s: GameState): number {
  return s.viewH - FLOOR_H
}

export function createGameState(viewH: number = DEFAULT_VIEW_H): GameState {
  return {
    phase: 'ready',
    bird: { y: readyBirdY(viewH, 0), vy: 0, frameTime: 0 },
    pipes: [],
    score: 0,
    scroll: 0,
    time: 0,
    viewH,
    backgroundIndex: 0,
  }
}

function readyBirdY(viewH: number, time: number): number {
  return viewH / 2 - 40 + Math.sin(time * 3) * 6
}

/** In-place reset (the state object lives in the render loop closure). */
export function resetGame(s: GameState): void {
  Object.assign(s, createGameState(s.viewH))
}

/** Begin a run from the ready screen. */
export function startGame(s: GameState): void {
  s.phase = 'playing'
  s.bird.y = s.viewH / 2 - 40
  s.bird.vy = FLAP_VELOCITY
  s.bird.frameTime = 0
  s.pipes = []
  s.score = 0
}

/** One input: tap / click / space. Starts the run from ready, flaps in air. */
export function flap(s: GameState): void {
  if (s.phase === 'ready') {
    startGame(s)
  } else if (s.phase === 'playing') {
    s.bird.vy = FLAP_VELOCITY
    s.bird.frameTime = 0
  }
}

function spawnPipe(s: GameState): void {
  const gapTopMax = floorTop(s) - 30 - PIPE_GAP
  const gapTop = GAP_TOP_MIN + Math.random() * (gapTopMax - GAP_TOP_MIN)
  const last = s.pipes[s.pipes.length - 1]
  // Spawn fully off-screen even when drawn SPRITE_SCALE× wider.
  const spawnX = LOGICAL_W + PIPE_CAP_W * SPRITE_SCALE
  const x = last
    ? Math.max(last.x + PIPE_SPACING, spawnX)
    : spawnX
  s.pipes.push({ x, gapTop, passed: false })
}

/**
 * GAME-03 — does the bird's hitbox overlap a pipe pair?
 *
 * The hitbox mirrors the renderer exactly: each pipe is as wide as its cap
 * (PIPE_CAP_W * SPRITE_SCALE at the pair's left edge — the widest part of the
 * art), the top pipe is solid from the sky down to gapTop, the bottom pipe
 * from gapBottom down to the ground. The bird is the circle it flies as:
 * BIRD_X ± BIRD_R horizontally, s.bird.y ± BIRD_R vertically. The 6px body
 * inset (x + 2*S each side) is ignored on purpose — colliding with the caps'
 * full width is what the eye judges and what classic flappy does.
 */
export function birdHitsPipe(s: GameState, p: PipePair): boolean {
  const capW = PIPE_CAP_W * SPRITE_SCALE
  const birdLeft = BIRD_X - BIRD_R
  const birdRight = BIRD_X + BIRD_R
  if (birdRight <= p.x || birdLeft >= p.x + capW) return false
  const gapBottom = p.gapTop + PIPE_GAP
  return s.bird.y - BIRD_R < p.gapTop || s.bird.y + BIRD_R > gapBottom
}

/** Advance the world by dt seconds (clamped — tab switches must not jump). */
export function stepGame(s: GameState, dtRaw: number): void {
  const dt = Math.min(dtRaw, 0.05)
  s.time += dt

  if (s.phase === 'game-over') return // freeze the world on the death screen

  if (s.phase === 'ready') {
    // Idle hover: gentle bob, slowly scrolling scenery.
    s.scroll += PIPE_SPEED * 0.5 * dt
    s.bird.y = readyBirdY(s.viewH, s.time)
    s.bird.frameTime += dt * 1000
    return
  }

  // Playing: gravity, flap handled by flap(); ground/ceiling contact ends the run.
  s.scroll += PIPE_SPEED * dt
  s.bird.vy = Math.min(s.bird.vy + GRAVITY * dt, MAX_FALL_SPEED)
  s.bird.y += s.bird.vy * dt
  s.bird.frameTime += dt * 1000

  const last = s.pipes[s.pipes.length - 1]
  if (!last || last.x < LOGICAL_W - PIPE_SPACING) spawnPipe(s)
  for (const p of s.pipes) p.x -= PIPE_SPEED * dt
  // Despawn only when the scaled cap has fully left the screen.
  if (s.pipes[0] && s.pipes[0].x < -PIPE_CAP_W * SPRITE_SCALE) s.pipes.shift()

  // Ceiling: flying above the screen is fatal too (no hiding behind the UI).
  if (s.bird.y - BIRD_R <= 0) {
    s.bird.y = BIRD_R
    s.phase = 'game-over'
    return
  }
  // Ground: landing ends the run.
  if (s.bird.y + BIRD_R >= floorTop(s)) {
    s.bird.y = floorTop(s) - BIRD_R
    s.phase = 'game-over'
    return
  }
  // GAME-03: touching a pipe pair (above the gap or below it) ends the run.
  for (const p of s.pipes) {
    if (birdHitsPipe(s, p)) {
      s.phase = 'game-over'
      return
    }
  }
  // Score for cleared pipes arrives with GAME-04 (`passed` is already tracked).
}

/** Flap-cycle frame 0-3: animates while rising/hovering, holds mid-flap otherwise. */
export function birdFrame(s: GameState): number {
  const animating = s.phase === 'ready' || s.bird.vy < 0
  return animating ? Math.floor(s.bird.frameTime / FLAP_FRAME_MS) % 4 : 1
}
