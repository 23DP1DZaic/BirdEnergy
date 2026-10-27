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
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advancePipePalette,
  createGameState,
  deadBirds,
  drainEvents,
  flap,
  FLOOR_H,
  isCelebrating,
  LOGICAL_W,
  pauseGame,
  replayGame,
  resetGame,
  resumeGame,
  runResult,
  stepGame,
  syncChallenge,
  type DeadBird,
  type GameChallengeView,
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
// AUDIO: the loop is started once at app level (App.tsx) and keeps playing
// across screens; this screen plays the run's sound effects and stops the loop
// on death — rewound to the start, so the next attempt begins the track over.
// Everything is a no-op without files in src/assets/Sound (see features/audio.ts).
import {
  audioStatus,
  playMusic,
  playSfx,
  stopMusic,
  unlockAudio,
} from '../audio'
import { BIRD_SKIN_CHANGE_EVENT, getStoredBirdSkinIndex } from '../birdSkin'
import { HAPTIC, haptic } from '../haptics'
import { PixelIcon } from '../ui/PixelIcon'
import { SoundControls } from '../SoundControls'
import {
  SOUND_SETTINGS_CHANGE_EVENT,
  isSfxEnabled,
  setSfxEnabled,
} from '../soundSettings'
import {
  PENDING_RUNS_CHANGE_EVENT,
  pendingRunCount,
} from '../pendingRuns'
import { shareScore } from '../shareScore'
import { useT } from '../../i18n'
import { prefersReducedMotion } from '../reducedMotion'
import { GROUND_CHANGE_EVENT, getStoredGroundIndex } from '../groundTile'
import './game.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; sprites: GameSpriteImages }
  | { kind: 'error'; message: string }

/** The engine handlers the DOM overlays call (the state object lives in the
 *  effect closure — see actionsRef below). */
interface GameActions {
  pause: () => void
  resume: () => void
  replay: () => void
}

/**
 * C — how long the challenge-completion banner pulses after a run ends. It is
 * measured in real time in the frame loop, because the run's own clock
 * (state.time) stops the moment the game-over screen appears.
 */
const CELEBRATE_PULSE_MS = 3000

/** Resize the canvas backing store to the container and map logical px onto it. */
function resizeCanvas(
  canvas: HTMLCanvasElement,
  wrap: HTMLDivElement,
  ctx: CanvasRenderingContext2D,
  state: GameState,
  /** Max backing-store scale for this step of the adaptive ladder — always
   *  additionally clamped by the live devicePixelRatio. */
  scale: number,
): void {
  const rect = wrap.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return
  // Never above 2× — every frame repaints the whole backing store and this is
  // pixel art upscaled nearest-neighbour: above 2× the extra pixels are
  // invisible, but on 3× phones they triple the fill cost (the main frame-lag
  // source on high-DPR devices; 3× → 2× is 55% fewer pixels per frame). The
  // adaptive ladder in the loop below lowers `scale` further (1.5×, 1×) when
  // the device can't hold 60 fps — see applyScale.
  const dpr = Math.min(window.devicePixelRatio || 1, scale)
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  // Resizing resets ctx settings (incl. imageSmoothingEnabled); restoring
  // them also hands the renderer the current backing-store scale, which its
  // cached score-HUD layer is rasterized at (1:1 blit, no resampling).
  configureCanvas(ctx, canvas.width / LOGICAL_W)
  // Logical world: 480 wide, height follows the container aspect.
  const newViewH = Math.max(320, Math.round((rect.height / rect.width) * 480))
  state.viewH = newViewH
  // Corpses always rest ON the ground by construction — re-glue them to the
  // floor line on EVERY reflow (mount and resize), not only when viewH
  // changes: a fresh state starts at DEFAULT_VIEW_H, so a change-gate can be
  // skipped and leave corpses floating in the sky.
  deadBirds.restOn(newViewH - FLOOR_H)
  // The bird lying on the ground behind the Game-Over panel is glued the
  // same way; airborne phases (ready/playing/dead) re-derive their own
  // position from the new viewH on the next frame.
  if (state.phase === 'game-over') state.bird.y = newViewH - FLOOR_H
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
  serverBest = 0,
  challenge = null,
  coinState = 'idle',
  coinReward = null,
  onRetryCoins,
}: {
  onPhaseChange?: (phase: GamePhase) => void
  /** DATA-01: fired once per finished run with its final numbers. */
  onRunEnd?: (result: RunResult) => void
  /** C — the player's real (server) personal best; 0 while it is unknown. */
  serverBest?: number
  /** C — the active challenge, when one is running (GamePage resolves it). */
  challenge?: GameChallengeView | null
  /** ECON-03 — the Game Over coin line (server-confirmed reward only). */
  coinState?: 'idle' | 'saving' | 'pending' | 'confirmed'
  /** ECON-03 — coins paid for this run + the authoritative balance. */
  coinReward?: { earned: number; balance: number } | null
  /** ECON-03 — replay the unconfirmed attempt (same submission id). */
  onRetryCoins?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  /** DEV-only perf overlay (game.css `.perf-hud`); see the loop below. */
  const hudRef = useRef<HTMLDivElement>(null)
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const { t, tn } = useT()
  // The engine is owned by the effect closure below; React only mirrors what
  // the DOM overlays need, so a phase change never tears the engine down.
  const [uiPhase, setUiPhase] = useState<GamePhase>('ready')
  // PAUSE — the big 3/2/1 digit (0 = no countdown on screen).
  const [countdownNum, setCountdownNum] = useState(0)
  // Score frozen into the pause screen and the Game Over share button.
  const [shownScore, setShownScore] = useState(0)
  // DATA-01 — runs waiting for a connection ("will sync when online").
  const [queued, setQueued] = useState(pendingRunCount)
  // A run is in flight (or frozen under the pause screen): the corner keeps
  // only the Pause control, see the control cluster below.
  const inRun =
    uiPhase === 'playing' ||
    uiPhase === 'paused' ||
    uiPhase === 'countdown' ||
    uiPhase === 'dead'
  // AUDIO — the in-game speaker button mirrors the Sound effects switch.
  const [sfxOn, setSfxOn] = useState(isSfxEnabled)
  // Share feedback: the button doubles as its own confirmation.
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  )
  // PAUSE — DOM overlays never touch the engine state directly; it lives in the
  // effect closure, so the buttons reach it through this ref.
  const actionsRef = useRef<GameActions | null>(null)
  // C — the engine keeps its OWN copy of these (it owns a frozen object), so a
  // new best or a new progress value must never restart the run: the frame
  // loop copies them through this ref instead of reading the props.
  // C — seq counts these prop updates; the frame loop repaints the frozen
  // game-over panel once per late-arriving value (see syncedSeq there).
  const latest = useRef({ serverBest, challenge, seq: 0 })
  useEffect(() => {
    latest.current = { serverBest, challenge, seq: latest.current.seq + 1 }
  }, [serverBest, challenge])

  // DATA-01 — the queued-runs count follows the queue itself (queued, replayed
  // on reconnect, dropped as permanently invalid) plus the connection state, so
  // the indicator appears the moment a run is parked and clears the moment it
  // is replayed — no polling.
  useEffect(() => {
    const sync = () => setQueued(pendingRunCount())
    window.addEventListener(PENDING_RUNS_CHANGE_EVENT, sync)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener(PENDING_RUNS_CHANGE_EVENT, sync)
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  // AUDIO — Home's switches stay authoritative; the in-game button reflects a
  // change made there (and vice versa) through the shared settings event.
  useEffect(() => {
    const sync = () => setSfxOn(isSfxEnabled())
    window.addEventListener(SOUND_SETTINGS_CHANGE_EVENT, sync)
    return () => window.removeEventListener(SOUND_SETTINGS_CHANGE_EVENT, sync)
  }, [])

  // SHARE — Telegram's own picker first, then the native sheet, then the
  // clipboard (shareScore.ts). Dismissing a sheet is not a failure: the
  // button only reports an actual error.
  const shareRun = useCallback(async () => {
    const outcome = await shareScore(
      t('share.title'),
      tn('share.text', shownScore),
    )
    if (outcome === 'copied') setShareState('copied')
    else if (outcome === 'failed') setShareState('failed')
    else setShareState('idle')
  }, [shownScore, t, tn])

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
      // DEV-only audio probe: which files Vite saw, what decoded, whether the
      // context is running and what was actually started (see audioStatus).
      ;(window as unknown as { __birdAudio?: typeof audioStatus }).__birdAudio =
        audioStatus
      // Live reference to the corpse store (test hook: a full page reload
      // re-evaluates the module → the store starts empty).
      ;(window as unknown as { __birdDeadBirds?: readonly DeadBird[] })
        .__birdDeadBirds = deadBirds.all()
    }

    // Report phase transitions (ready → playing → game-over → ready) so the
    // shell can hide the navigation during active gameplay only. A transition
    // INTO game-over is a finished run: report its final numbers once (DATA-01).
    let reported: GamePhase | null = null
    const reportPhase = () => {
      if (state.phase !== reported) {
        const previous = reported
        reported = state.phase
        setUiPhase(state.phase)
        onPhaseChange?.(state.phase)
        // Background music is an app-wide loop (App.tsx starts it) that keeps
        // playing across screens. A death stops it and rewinds to the first
        // sample (stopMusic), so the track starts over; it comes back as soon
        // as the ready screen appears ("click to play"), not on the tap that
        // finally starts the run. Leaving the game must not cut the track.
        if (state.phase === 'dead') {
          stopMusic()
        } else if (state.phase === 'ready' || state.phase === 'playing') {
          playMusic()
        }
        // One death = playing → dead → game-over, so this edge fires exactly
        // once per death (never on the collision frame itself), keeping the
        // current score-saving flow with no duplicate game results.
        if (state.phase === 'game-over' && previous === 'dead') {
          onRunEnd?.(runResult(state))
        }
        // The pause screen and the Game Over panel show the score that is
        // frozen behind them (the share button needs the final number).
        if (state.phase === 'paused' || state.phase === 'game-over') {
          setShownScore(state.score)
        }
        if (state.phase === 'game-over') setShareState('idle')
      }
    }
    reportPhase()

    // --- adaptive resolution ladder (mobile perf) -----------------------
    // Backing-store scale steps, highest first, capped by the device DPR: a
    // 3× phone starts at the 2× cap and may fall to 1.5× / 1×, a 1.5× device
    // to 1×, and a 1× device has no steps (it is already at the floor).
    // Pixels painted per frame dominate the cost on mid-range Android GPUs;
    // physics and collision run in logical coordinates and are untouched, so
    // a step only changes sharpness — never gameplay, scoring or hitboxes.
    const deviceCap = Math.min(window.devicePixelRatio || 1, 2)
    const scaleSteps = [deviceCap, ...[2, 1.5, 1].filter((v) => v < deviceCap)]
    let scaleStep = 0

    const reflow = () =>
      resizeCanvas(canvas, wrap, ctx, state, scaleSteps[scaleStep])
    reflow()

    // The game-over scene is frozen (stepGame returns immediately), so paint
    // it once and then stop redrawing a static frame at display rate. A phase
    // change or a skin/background/ground event sets redrawPending to repaint.
    let drawnPhase: GamePhase | null = null
    let redrawPending = true
    // C — last `seq` of the best/challenge props copied into the engine
    // state; a bump schedules one repaint of the frozen game-over panel.
    let syncedSeq = 0
    // C — real-time end of the completion banner's pulse (0 = not pulsing).
    let celebrateUntil = 0

    // --- DEV perf overlay (mirrored to window.__birdPerf) ---------------
    // Top-left under `npm run dev` only — stripped from production builds.
    // The numbers are also written to window.__birdPerf so they can be read
    // off a phone from a remote console. Refreshed 4×/s, never per frame.
    const devHud = import.meta.env.DEV
    const hudEl = devHud ? hudRef.current : null
    let drawMs = 0
    let fps = 0
    let hudLast = 0
    let draws = 0 // paints since page load — makes the draw-rate cap observable

    // Every paint goes through here: the game-over freeze bookkeeping, the
    // draw-time sample and the rate-limit timestamp stay consistent.
    let lastDraw = 0
    const drawFrame = (now: number) => {
      if (devHud) {
        const t0 = performance.now()
        drawGame(ctx, sprites, state)
        const dtDraw = performance.now() - t0
        drawMs = drawMs === 0 ? dtDraw : drawMs * 0.9 + dtDraw * 0.1
      } else {
        drawGame(ctx, sprites, state)
      }
      if (devHud) draws++
      drawnPhase = state.phase
      redrawPending = false
      lastDraw = now
    }

    // First frame before any rAF fires (hidden tab, throttling).
    drawGame(ctx, sprites, state)

    // Resizing clears the backing store — with alpha:false that clear is
    // opaque black, so repaint in the same callback instead of waiting for
    // the next rAF tick (no black flash on rotate/resize). A ladder step
    // takes the same route through applyScale below.
    const observer = new ResizeObserver(() => {
      reflow()
      drawFrame(performance.now())
    })
    observer.observe(wrap)

    // --- frame-time sampling for the ladder -----------------------------
    // A ring of the last 60 rAF deltas; deltas over 500 ms (tab switches,
    // heavy throttling) are dropped instead of being read as jank.
    const SAMPLES = 60
    const SLOW_MS = 25 // a frame this long is a visible drop under ~40 fps
    const SLOW_LIMIT = 8 // 8 of the last 60 slow → the device can't hold 60
    const RECOVERY_FRAMES = 240 // clean frames before trying a higher scale
    const deltas = new Float64Array(SAMPLES)
    let deltaIdx = 0
    let deltaCount = 0
    let slowCount = 0
    let cleanStreak = 0

    const resetSampler = () => {
      deltaCount = 0
      slowCount = 0
      cleanStreak = 0
    }

    // A ladder step repaints immediately in the same tick (resizing clears the
    // backing store — the same no-black-flash rule as the observer above).
    const applyScale = () => {
      resetSampler()
      reflow()
      drawFrame(performance.now())
    }

    let raf = 0
    let last = performance.now()
    let running = !document.hidden
    // PAUSE — last countdown number pushed to React (see the frame loop).
    let countdownShown = 0

    // Running mean of the rAF delta: a panel measurably faster than 60 Hz
    // (mean < 15 ms) may have its draws rate-limited below, a 60 Hz or
    // stuttering one never does — the limiter can only skip frames the panel
    // would not have shown anyway.
    let meanDelta = 0

    const frame = (now: number) => {
      const deltaMs = now - last
      const dt = deltaMs / 1000
      last = now
      if (running) stepGame(state, dt)
      // G — the pipe palette advances HERE (once per frame, in the engine
      // loop), not in the draw path, so a repaint can never re-roll it.
      advancePipePalette(state, sprites.pipeSets.length)
      reportPhase()
      // PAUSE — mirror the countdown number into React for the DOM overlay:
      // the engine owns the timer, the DOM only shows 3 → 2 → 1 (setState with
      // the same value is a no-op, so this settles to no re-renders).
      const shown =
        state.phase === 'countdown'
          ? Math.max(1, Math.ceil(state.countdownLeft))
          : 0
      if (shown !== countdownShown) {
        countdownShown = shown
        setCountdownNum(shown)
      }
      // AUDIO + HAPTICS — the engine queues events as data; this is where
      // sound happens and where the phone buzzes. Haptics skip `flap` on
      // purpose (a buzz on every tap is noise, not feedback).
      // old part, in case i will mess up
      //for (const event of drainEvents(state)) {
      //  playSfx(event)
      //  if (event === 'hit') haptic(HAPTIC.hit)
      //  else if (event === 'die') haptic(HAPTIC.die)
      //  else if (event === 'score') haptic(HAPTIC.score)
      //}
          for (const event of drainEvents(state)) {
      if (event === 'hit') {
    // Play death sound 100ms after collision.
    setTimeout(() => {
      playSfx('die')
    }, 200)
  } else if (event !== 'die') {
    playSfx(event)
  }

      if (event === 'hit') haptic(HAPTIC.hit)
      else if (event === 'die') haptic(HAPTIC.die)
      else if (event === 'score') haptic(HAPTIC.score)
    }
      // C — refresh the personal best and the challenge block. The engine
      // derives the completion celebration from the values themselves.
      syncChallenge(state, latest.current)
      // C — the best/progress values land asynchronously (the submit
      // response, the challenge fetch), i.e. always AFTER the game-over
      // frame was first painted. The scene is frozen, so a value change must
      // schedule a repaint — otherwise the panel keeps the numbers from the
      // moment of death forever.
      if (latest.current.seq !== syncedSeq) {
        syncedSeq = latest.current.seq
        redrawPending = true
      }

      if (deltaMs > 0 && deltaMs <= 500) {
        meanDelta =
          meanDelta === 0 ? deltaMs : meanDelta * 0.95 + deltaMs * 0.05
      }

      // Ladder sampling — only meaningful while frames keep flowing.
      if (running && deltaMs > 0 && deltaMs <= 500) {
        if (deltaCount === SAMPLES) {
          if (deltas[deltaIdx] > SLOW_MS) slowCount--
        } else {
          deltaCount++
        }
        const slow = deltaMs > SLOW_MS
        deltas[deltaIdx] = deltaMs
        deltaIdx = (deltaIdx + 1) % SAMPLES
        if (slow) {
          slowCount++
          cleanStreak = 0
        } else {
          cleanStreak++
        }

        if (scaleSteps.length > 1) {
          if (deltaCount === SAMPLES && slowCount >= SLOW_LIMIT) {
            if (scaleStep < scaleSteps.length - 1) {
              scaleStep++
              applyScale() // one step; the fresh window decides the next
            }
          } else if (
            scaleStep > 0 &&
            cleanStreak >= RECOVERY_FRAMES &&
            // Recovery only OUTSIDE a run — neither while playing nor
            // during the death animation: a resolution change mid-flight is
            // a needless distraction at the moment the player needs focus,
            // and it stops a borderline device oscillating between scales.
            state.phase !== 'playing' && state.phase !== 'dead'
          ) {
            scaleStep--
            applyScale()
          }
        }
      }

      // C — the completion banner pulses for a few seconds after a run ends.
      // s.time is frozen on the game-over screen, so the window is measured in
      // real time — which also BOUNDS the repaint to those seconds instead of
      // redrawing the frozen frame every rAF until the player taps.
      const celebrating = isCelebrating(state)
      if (!celebrating) {
        celebrateUntil = 0
        state.celebrateAlpha = 1
      } else {
        if (celebrateUntil === 0) celebrateUntil = now + CELEBRATE_PULSE_MS
        state.celebrateAlpha =
          now < celebrateUntil && !prefersReducedMotion()
            ? 0.6 + 0.4 * Math.sin(now / 125)
            : 1
      }

      // Rate-limit draws on panels faster than 60 Hz (see meanDelta above);
      // the engine still steps every rAF, and the frozen scenes still paint
      // their single frame immediately.
      const fastPanel = meanDelta > 0 && meanDelta < 15
      // PAUSE — pause screen and countdown sit over a FROZEN scene (the
      // renderer draws it with the plain score HUD), so like game-over they
      // repaint only on a phase change, a late-arriving prop value or the
      // banner pulse — not every rAF.
      const frozenScene =
        state.phase === 'game-over' ||
        state.phase === 'paused' ||
        state.phase === 'countdown'
      if (!frozenScene) {
        if (!fastPanel || now - lastDraw >= 14) drawFrame(now)
      } else if (
        drawnPhase !== state.phase ||
        redrawPending ||
        // C — keep drawing only while the banner actually pulses; under
        // reduced motion it is drawn once and stays still.
        (state.phase === 'game-over' &&
          celebrateUntil > now &&
          !prefersReducedMotion())
      ) {
        drawFrame(now)
      }

      if (devHud) {
        const instFps = 1000 / Math.max(deltaMs, 0.1)
        fps = fps === 0 ? instFps : fps * 0.9 + instFps * 0.1
        if (now - hudLast >= 250) {
          hudLast = now
          const perf = {
            fps: Math.round(fps),
            frameMs: meanDelta,
            drawMs,
            draws,
            scale: scaleSteps[scaleStep],
            scaleStep,
            scaleSteps: scaleSteps.length,
            slow: slowCount,
            samples: deltaCount,
          }
          ;(window as unknown as { __birdPerf?: typeof perf }).__birdPerf = perf
          if (hudEl) {
            hudEl.textContent =
              `${perf.fps} fps  ${meanDelta.toFixed(1)}ms frame  ${drawMs.toFixed(1)}ms draw\n` +
              `scale \u00d7${perf.scale} (step ${scaleStep + 1}/${scaleSteps.length})  slow ${slowCount}/${deltaCount}`
          }
        }
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onVisibility = () => {
      running = !document.hidden
      if (running) {
        last = performance.now()
        resetSampler() // the resume gap must not count as jank
      }
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

      // DEV-only: force an adaptive-resolution step (renders 1.5×/1× without
      // needing a device that can't hold 60 fps; index into scaleSteps).
      ;(
        window as unknown as { __birdSetScaleStep?: (step: number) => void }
      ).__birdSetScaleStep = (step) => {
        const next = Math.max(
          0,
          Math.min(scaleSteps.length - 1, Math.round(step)),
        )
        if (next === scaleStep) return
        scaleStep = next
        applyScale()
      }
    }

    const onPointer = (e: PointerEvent) => {
      e.preventDefault()
      // AUDIO — this tap is the user gesture browsers require to start (or
      // resume) the AudioContext; doing it here beats waiting for a global
      // listener, especially inside Telegram's WebView.
      unlockAudio()
      if (state.phase === 'game-over') resetGame(state)
      else flap(state)
      // Run the phase reporting inside the gesture itself: the music's play()
      // is only allowed from a user gesture, and the frame loop would call it
      // a frame later, where strict WebViews refuse it.
      reportPhase()
    }

    const onKey = (e: KeyboardEvent) => {
      // PAUSE — Esc toggles the pause screen (Space stays flap-only, so a
      // stray jump key can never dismiss the pause menu).
      if (e.code === 'Escape') {
        e.preventDefault()
        if (state.phase === 'playing') pauseGame(state)
        else if (state.phase === 'paused') resumeGame(state)
        return
      }
      if (e.code !== 'Space') return
      e.preventDefault()
      unlockAudio()
      if (state.phase === 'game-over') resetGame(state)
      else flap(state)
      reportPhase()
    }

    // PAUSE — the DOM overlays talk to the engine through this ref: `state`
    // lives in this effect closure, React state only carries the phase.
    actionsRef.current = {
      pause: () => pauseGame(state),
      resume: () => resumeGame(state),
      replay: () => replayGame(state),
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
      actionsRef.current = null
      // Leaving the screen hands the loop back to the app: it keeps playing on
      // every other tab, and after a death it starts again from the beginning.
      playMusic()
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
      {/* DEV-only perf overlay — see the frame loop. Inline styles on
          purpose: a game.css rule would still ship in the production CSS
          (only the JSX is stripped by the DEV flag), so keeping them here
          leaves the built bundle with no trace of the overlay. */}
      {import.meta.env.DEV && (
        <div
          ref={hudRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            zIndex: 10,
            padding: '4px 6px',
            borderRadius: 4,
            background: 'rgba(0, 0, 0, 0.55)',
            color: '#eaffea',
            font: '10px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            whiteSpace: 'pre',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      )}
      {/* Top-right control cluster: clear of the canvas HUD (score is drawn
          top-centre) and of the DEV perf overlay (top-left). During a run the
          corner shows nothing but Pause — the sound switches would sit under
          the player's thumb at the exact moment they must not be hit; the
          pause menu carries the full Music / Effects block instead. */}
      <div className="game-controls">
        {!inRun && (
          <button
            type="button"
            className="game-control"
            aria-pressed={sfxOn}
            aria-label={t(sfxOn ? 'sound.turnOff' : 'sound.turnOn')}
            title={t(sfxOn ? 'sound.turnOff' : 'sound.turnOn')}
            onClick={() => setSfxEnabled(!sfxOn)}
          >
            <PixelIcon name={sfxOn ? 'soundOn' : 'soundOff'} size={32} />
          </button>
        )}
        {uiPhase === 'playing' && (
          <button
            type="button"
            className="game-control"
            aria-label={t('pause.open')}
            title={t('pause.open')}
            onClick={() => actionsRef.current?.pause()}
          >
            <PixelIcon name="pause" size={32} />
          </button>
        )}
      </div>

      {/* PAUSE — the run is frozen underneath (the engine ignores every input
          but Esc/this button), so the menu sits on the live scene. */}
      {uiPhase === 'paused' && (
        <div
          className="game-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t('pause.title')}
        >
          <p className="game-modal-title">{t('pause.title')}</p>
          <p className="game-modal-score">
            {t('pause.score', { score: shownScore })}
          </p>
          {/* The same Music / Effects block Home's settings menu shows —
              reachable mid-run without leaving the game. */}
          <SoundControls />
          <div className="game-modal-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                haptic(HAPTIC.resume)
                actionsRef.current?.resume()
              }}
            >
              <PixelIcon name="play" size={22} />
              {t('pause.resume')}
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                haptic(HAPTIC.resume)
                actionsRef.current?.replay()
              }}
            >
              <PixelIcon name="refresh" size={22} />
              {t('pause.playAgain')}
            </button>
          </div>
        </div>
      )}

      {/* PAUSE — 3-2-1 before the world moves again. Pointer-events off: taps
          during the countdown are already ignored by the engine, and a tap
          that hit this overlay would otherwise do nothing at all. */}
      {uiPhase === 'countdown' && countdownNum > 0 && (
        <div
          className="game-countdown"
          aria-live="assertive"
          aria-label={t('pause.countdown', { n: countdownNum })}
        >
          <span key={countdownNum} className="game-countdown-num">
            {countdownNum}
          </span>
        </div>
      )}

      {/* DATA-01 — share the finished run; the queued-runs note says a score is
          safe on the device and will sync by itself. */}
      {uiPhase === 'game-over' && (
        <div className="game-over-actions">
          {/* ECON-03 — the reward shown here is the server-confirmed amount
              (nothing is added locally); the wallet is the balance the same
              response returned. A lost save stays retryable with the same
              submission id instead of hiding the reward. */}
          {coinState === 'confirmed' && coinReward && (
            <p className="game-coins" role="status">
              <span className="game-coins-earned">
                {tn('canvas.coinsEarned', coinReward.earned)}
              </span>
              <span className="game-coins-wallet">
                {t('canvas.wallet', { n: coinReward.balance })}
              </span>
            </p>
          )}
          {coinState === 'pending' && (
            <>
              <p className="game-coins game-coins-pending" role="status">
                {t('canvas.coinsPending')}
              </p>
              {onRetryCoins && (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={onRetryCoins}
                >
                  {t('canvas.retryCoins')}
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="btn btn-small game-share"
            onClick={() => void shareRun()}
          >
            {t(
              shareState === 'copied'
                ? 'share.copied'
                : shareState === 'failed'
                  ? 'share.failed'
                  : 'share.button',
            )}
          </button>
          {queued > 0 && (
            <p className="game-queued" role="status">
              {tn('queue.pending', queued)}
            </p>
          )}
        </div>
      )}

      {load.kind === 'loading' && <p className="game-status">Loading…</p>}
      {load.kind === 'error' && (
        <p className="game-status game-status-error">{load.message}</p>
      )}
    </div>
  )
}
