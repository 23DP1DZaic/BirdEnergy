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
  flap,
  LOGICAL_W,
  resetGame,
  stepGame,
  type GamePhase,
  type GameState,
} from './engine'
import { configureCanvas, drawGame } from './renderer'
import { loadGameSprites, type GameSpriteImages } from './sprites'
import { BACKGROUND_CHANGE_EVENT, getStoredBackgroundIndex } from '../homeBackground'
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
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
    configureCanvas(ctx) // resizing resets ctx settings
  }
  // Logical world: 480 wide, height follows the container aspect.
  state.viewH = Math.max(320, Math.round((rect.height / rect.width) * 480))
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
}: {
  onPhaseChange?: (phase: GamePhase) => void
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
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    configureCanvas(ctx)
    const state = createGameState()
    // DEV-only state inspector + deterministic stepper (tests/debugging).
    if (import.meta.env.DEV) {
      ;(window as unknown as { __birdGame?: GameState }).__birdGame = state
    }

    // Report phase transitions (ready → playing → game-over → ready) so the
    // shell can hide the navigation during active gameplay only.
    let reported: GamePhase | null = null
    const reportPhase = () => {
      if (state.phase !== reported) {
        reported = state.phase
        onPhaseChange?.(state.phase)
      }
    }
    reportPhase()

    const reflow = () => resizeCanvas(canvas, wrap, ctx, state)
    reflow()
    // First frame before any rAF fires (hidden tab, throttling).
    drawGame(ctx, load.sprites, state)

    const observer = new ResizeObserver(reflow)
    observer.observe(wrap)

    let raf = 0
    let last = performance.now()
    let running = !document.hidden

    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (running) stepGame(state, dt)
      reportPhase()
      drawGame(ctx, load.sprites, state)
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
        drawGame(ctx, load.sprites, state)
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

    // Home and Game share the background index (UI-07 continuity).
    const onBackgroundChange = () => {
      state.backgroundIndex = getStoredBackgroundIndex()
    }
    state.backgroundIndex = getStoredBackgroundIndex()

    canvas.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(BACKGROUND_CHANGE_EVENT, onBackgroundChange)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(BACKGROUND_CHANGE_EVENT, onBackgroundChange)
    }
  }, [load, onPhaseChange])

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
