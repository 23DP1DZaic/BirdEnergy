// GAME-01 — React wrapper around the game engine + renderer.
//
// The canvas backing store matches its container (ResizeObserver + device
// pixel ratio) and a ctx transform maps the logical 480x-viewH world onto it,
// so background, ground, bird and pipes share one coordinate system and fill
// the element at any size or DPR — no letterboxing, no dead space.
//
// rAF loop advances the engine with real dt and pauses when the tab is hidden.
// Input: pointer (touch + mouse) and Space. The background choice is shared
// with Home through a window event (see homeBackground.ts). The engine phase
// is reported to the parent so the shell can remove the navigation while a
// run is actually in progress and bring it back on ready/game-over.
import { useEffect, useRef, useState } from 'react'
import {
  createGameState,
  deadBirds,
  flap,
  FLOOR_H,
  LOGICAL_W,
  resetGame,
  runResult,
  stepGame,
  type DeadBird,
  type GamePhase,
  type GameState,
  type RunResult,
} from './engine'
import { configureCanvas, drawGame } from './renderer'
import { loadGameSprites, type GameSpriteImages } from './sprites'
import {
  BACKGROUND_CHANGE_EVENT,
  getStoredBackgroundIndex,
} from '../homeBackground'
import { BIRD_SKIN_CHANGE_EVENT, getStoredBirdSkinIndex } from '../birdSkin'
import { GROUND_CHANGE_EVENT, getStoredGroundIndex } from '../groundTile'
import './game.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; sprites: GameSpriteImages }
  | { kind: 'error'; message: string }

/** Resize the canvas backing store to the container and map logical px onto it. */
function resizeCanvas(
  canvas: HTMLCanvasElement,
  wrap: HTMLDivElement,
  ctx: CanvasRenderingContext2D,
  state: GameState,
): void {
  const rect = wrap.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return
  // Cap at 2× — every frame repaints the whole backing store and this is
  // pixel art upscaled nearest-neighbour: above 2× the extra pixels are
  // invisible, but on 3× phones they triple the fill cost (the main frame-lag
  // source on high-DPR devices; 3× → 2× is 55% fewer pixels per frame).
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
    configureCanvas(ctx) // resizing resets ctx settings
  }
  // Logical world: 480 wide, height follows the container aspect.
  const newViewH = Math.max(320, Math.round((rect.height / rect.width) * 480))
  if (newViewH !== state.viewH) {
    state.viewH = newViewH
    // Corpses always rest ON the ground by construction, so a resolution
    // change re-glues them to the new floor line instead of leaving them
    // floating in the sky where the old ground used to be.
    for (const d of deadBirds) d.y = newViewH - FLOOR_H - d.height / 2
    // The bird lying on the ground behind the Game-Over panel is glued the
    // same way; airborne phases (ready/playing/dead) re-derive their own
    // position from the new viewH on the next frame.
    if (state.phase === 'game-over') state.bird.y = newViewH - FLOOR_H
  }
  // Logical → backing-store mapping: the renderer keeps drawing in logical
  // coordinates; this transform makes the world cover the element exactly.
  ctx.setTransform(
    canvas.width / LOGICAL_W,
    0,
    0,
    canvas.height / state.viewH,
    0,
    0,
  )
}

export function GameCanvas({
  onPhaseChange,
  onRunEnd,
}: {
  onPhaseChange?: (phase: GamePhase) => void
  /** DATA-01: fired once per finished run with its final numbers. */
  onRunEnd?: (result: RunResult) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadGameSprites()
      .then((sprites) => {
        if (!cancelled) setLoad({ kind: 'ready', sprites })
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoad({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (load.kind !== 'ready') return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    // alpha:false — the scene paints every pixel each frame (sky down to the
    // horizon, ground band below), so canvas alpha compositing buys nothing;
    // skipping it halves the backing-store memory and speeds up blending.
    // (No desynchronized:true — it made the canvas skip compositor frames on
    // some platforms/captures, i.e. a blank/stale game surface.)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    configureCanvas(ctx)
    const state = createGameState()
    // Local mutable copy of the sprite set: the effect re-runs on every render
    // commit, so the render-captured `load.sprites` object itself must stay
    // untouched (react-hooks/immutability). The renderer takes sprites as a
    // parameter, so drawing from this copy re-skins every following frame.
    const sprites = {...load.sprites}
    // Bird skin starts at the stored choice; the renderer draws
    // sprites.birdSheet, so swapping it re-skins every following frame.
    // state.skinIndex mirrors the sheet so a corpse snapshot records the
    // exact skin the player dies with.
    const initialSkin = getStoredBirdSkinIndex()
    sprites.birdSheet = sprites.birdSkins[initialSkin] ?? sprites.birdSkins[0]
    state.skinIndex = initialSkin
    // DEV-only state inspector + deterministic stepper (tests/debugging).
    if (import.meta.env.DEV) {
      ;(window as unknown as { __birdGame?: GameState }).__birdGame = state
      // Live reference to the module-level corpse list (test hook: a full
      // page reload re-evaluates the module → the array starts empty).
      ;(window as unknown as { __birdDeadBirds?: DeadBird[] }).__birdDeadBirds =
        deadBirds
    }

    // Report phase transitions (ready → playing → game-over → ready) so the
    // shell can hide the navigation during active gameplay only. A transition
    // INTO game-over is a finished run: report its final numbers once (DATA-01).
    let reported: GamePhase | null = null
    const reportPhase = () => {
      if (state.phase !== reported) {
        const previous = reported
        reported = state.phase
        onPhaseChange?.(state.phase)
        // One death = playing → dead → game-over, so this edge fires exactly
        // once per death (never on the collision frame itself), keeping the
        // current score-saving flow with no duplicate game results.
        if (state.phase === 'game-over' && previous === 'dead') {
          onRunEnd?.(runResult(state))
        }
      }
    }
    reportPhase()

    const reflow = () => resizeCanvas(canvas, wrap, ctx, state)
    reflow()
    // First frame before any rAF fires (hidden tab, throttling).
    drawGame(ctx, sprites, state)

    // Resizing clears the backing store — with alpha:false that clear is
    // opaque black, so repaint in the same callback instead of waiting for
    // the next rAF tick (no black flash on rotate/resize).
    const observer = new ResizeObserver(() => {
      reflow()
      drawGame(ctx, sprites, state)
    })
    observer.observe(wrap)

    let raf = 0
    let last = performance.now()
    let running = !document.hidden

    // The game-over scene is frozen (stepGame returns immediately), so paint
    // it once and then stop redrawing a static frame at display rate. A phase
    // change or a skin/background/ground event sets redrawPending to repaint.
    let drawnPhase: GamePhase | null = null
    let redrawPending = true

    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (running) stepGame(state, dt)
      reportPhase()
      if (
        state.phase !== 'game-over' ||
        drawnPhase !== state.phase ||
        redrawPending
      ) {
        drawGame(ctx, sprites, state)
        drawnPhase = state.phase
        redrawPending = false
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onVisibility = () => {
      running = !document.hidden
      if (running) last = performance.now()
    }

    // DEV-only: run N fixed engine steps synchronously (deterministic checks
    // in a background tab where rAF is throttled).
    if (import.meta.env.DEV) {
      ;(
        window as unknown as {
          __birdGameStep?: (steps: number, dt: number) => void
        }
      ).__birdGameStep = (steps, dt) => {
        for (let i = 0; i < steps; i++) stepGame(state, dt)
        reportPhase()
        drawGame(ctx, sprites, state)
      }
    }

    const onPointer = (e: PointerEvent) => {
      e.preventDefault()
      if (state.phase === 'game-over') resetGame(state)
      else flap(state)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      if (state.phase === 'game-over') resetGame(state)
      else flap(state)
    }

    // Profile and Game share the background, ground and bird skin indices
    // (UI-07 continuity — selections apply to the canvas live).
    const onBackgroundChange = () => {
      state.backgroundIndex = getStoredBackgroundIndex()
      redrawPending = true
    }
    state.backgroundIndex = getStoredBackgroundIndex()
    const onGroundChange = () => {
      state.groundIndex = getStoredGroundIndex()
      redrawPending = true
    }
    state.groundIndex = getStoredGroundIndex()
    const onBirdSkinChange = () => {
      sprites.birdSheet = sprites.birdSkins[getStoredBirdSkinIndex()] ?? sprites.birdSkins[0]
      state.skinIndex = getStoredBirdSkinIndex()
      redrawPending = true
    }

    canvas.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(BACKGROUND_CHANGE_EVENT, onBackgroundChange)
    window.addEventListener(GROUND_CHANGE_EVENT, onGroundChange)
    window.addEventListener(BIRD_SKIN_CHANGE_EVENT, onBirdSkinChange)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(BACKGROUND_CHANGE_EVENT, onBackgroundChange)
      window.removeEventListener(GROUND_CHANGE_EVENT, onGroundChange)
      window.removeEventListener(BIRD_SKIN_CHANGE_EVENT, onBirdSkinChange)
    }
    // Callbacks arrive as stable useCallback identities (see GamePage), so a
    // changing identity would tear down and restart the whole engine here.
  }, [load, onPhaseChange, onRunEnd])

  return (
    <div className="game-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="game-canvas" aria-label="Bird Energy game" />
      {load.kind === 'loading' && <p className="game-status">Loading…</p>}
      {load.kind === 'error' && (
        <p className="game-status game-status-error">{load.message}</p>
      )}
    </div>
  )
}
