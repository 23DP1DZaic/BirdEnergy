// GAME-01 — canvas renderer.
//
// Pure functions from loaded sprites + state → CanvasRenderingContext2D.
// All coordinates are LOGICAL world px (480 x viewH); the wrapper's ctx
// transform maps them onto the backing store, so everything below shares one
// coordinate system. imageSmoothing stays off and CSS image-rendering:
// pixelated keeps the 16px art crisp while SPRITE_SCALE upsizes it.
//
// Layout (matches the Home page): the background tile is HEIGHT-FIT — its
// whole height spans from the top of the scene down to the ground line,
// repeating sideways with the aspect ratio preserved (no stretch, no empty
// strip above the ground) — and the ground strip is drawn at the bottom of
// the view, below the background and the gameplay area.
import {
  BIRD_FRAMES,
  BIRD_FRAME_W,
  type GameSpriteImages,
  type PipeSetImages,
} from './sprites'
import { t } from '../../i18n'
import { coinsForScore } from '../economy'
import { prefersReducedMotion } from '../reducedMotion'
import {
  BIRD_X,
  deadBirds,
  floorTop,
  LOGICAL_W,
  PIPE_CAP_W,
  PIPE_GAP,
  SPRITE_SCALE,
  birdFrame,
  isCelebrating,
  pipePalette,
  type GameState,
} from './engine'

const GROUND_TILE_W = 480

/** Pipe-body core (Green-mid): x2-29 of the 32px tile — 28px of tileable body. */
const BODY_CORE_X = 2
const BODY_CORE_W = 28

/**
 * Canvas text font — Press Start 2P (the app's pixel font, matches the CSS).
 * The Google-Fonts stylesheet is preloaded before first draw (see main.tsx),
 * with system-ui as the fallback while/if the webfont is unavailable.
 */
const PIXEL_FONT = '"Press Start 2P", system-ui, sans-serif'

/** Pixel-art crispness: nearest-neighbour everywhere. */
export function configureCanvas(
  ctx: CanvasRenderingContext2D,
  /** Backing-store px per logical px — the cached score HUD (below) is
   *  rasterized at this scale so its blit stays 1:1 device pixels. */
  scale?: number,
): void {
  ctx.imageSmoothingEnabled = false
  if (scale !== undefined && scale > 0) hudScale = scale
}

/**
 * Sky pattern cache (perf): `createPattern` + `new DOMMatrix()` used to run
 * EVERY frame — measured 660 pattern creations per 4s of play, churning
 * resources at display rate. The pattern only changes when the background
 * image or the context changes; the scroll transform is re-applied per frame
 * on one shared matrix.
 */
let skyPattern: CanvasPattern | null = null
let skyPatternImg: HTMLImageElement | null = null
let skyPatternCtx: CanvasRenderingContext2D | null = null
const skyMatrix = new DOMMatrix()

/**
 * Background, height-fit like the Home page's `background-size: auto 100%` +
 * repeat-x: one uniform scale maps the whole tile height onto the space
 * between the top of the scene and the ground line, so the art is never
 * stretched and no light-blue gap can appear above the ground.
 */
function drawSky(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
  s: GameState,
): void {
  const horizon = floorTop(s)
  if (horizon <= 0) return
  const bg = sprites.backgrounds[s.backgroundIndex % sprites.backgrounds.length]
  if (!skyPattern || skyPatternImg !== bg || skyPatternCtx !== ctx) {
    skyPattern = ctx.createPattern(bg, 'repeat-x')
    skyPatternImg = bg
    skyPatternCtx = ctx
  }
  if (!skyPattern) return
  const scale = horizon / bg.naturalHeight
  // Equivalent to new DOMMatrix().translateSelf(tx, 0).scaleSelf(scale, scale)
  // (= T·S) without allocating a matrix every frame.
  skyMatrix.a = scale
  skyMatrix.b = 0
  skyMatrix.c = 0
  skyMatrix.d = scale
  skyMatrix.e = -(s.scroll % (bg.naturalWidth * scale))
  skyMatrix.f = 0
  skyPattern.setTransform(skyMatrix)
  ctx.fillStyle = skyPattern
  ctx.fillRect(0, 0, LOGICAL_W, horizon)
}

/**
 * Cached pipe-body column (perf): the 28px core tile repeated vertically to
 * cover the tallest column seen, built lazily and only ever grown (per-frame
 * tiling of every pipe body was the largest source of drawImage calls).
 * Source resolution stays 1:1 with the art, so nearest-neighbour output is
 * bit-identical to drawing each tile directly.
 */
/**
 * Cached pipe-body columns (perf): the 28px core tile repeated vertically to
 * cover the tallest column seen, built lazily PER PALETTE IMAGE and only ever
 * grown (per-frame tiling of every pipe body was the largest source of
 * drawImage calls; the score-20 palette cross-fade draws two palettes in the
 * same frame, so a single-slot cache would rebuild on every pass).
 * Source resolution stays 1:1 with the art, so nearest-neighbour output is
 * bit-identical to drawing each tile directly.
 */
const bodyColumns = new Map<HTMLImageElement, HTMLCanvasElement>()

function getBodyColumn(
  body: HTMLImageElement,
  tiles: number,
): HTMLCanvasElement {
  const tileH = body.naturalHeight
  const needH = Math.max(1, tiles) * tileH
  const cached = bodyColumns.get(body)
  if (cached && cached.height >= needH) return cached
  const col = document.createElement('canvas')
  col.width = BODY_CORE_W
  col.height = needH
  const c = col.getContext('2d')
  if (c) {
    c.imageSmoothingEnabled = false
    for (let y = 0; y < col.height; y += tileH) {
      c.drawImage(
        body,
        BODY_CORE_X,
        0,
        BODY_CORE_W,
        tileH,
        0,
        y,
        BODY_CORE_W,
        tileH,
      )
    }
  }
  bodyColumns.set(body, col)
  return col
}

/** Cross-fade duration when the score rotates the pipe palette. */
const PIPE_COLOR_FADE_S = 0.5

/**
 * Body column from yFrom down to yTo (logical px) — ONE clipped drawImage
 * from the cached repeated-tile column (getBodyColumn) instead of a ~10
 * -iteration tiling loop per pipe (that was 40-50 drawImage calls per frame
 * during play). Pixel output is identical: the column holds the same tile
 * rows at the same 28px-core source width and the same ×3 vertical scale.
 * Module-level rather than a per-frame closure: this runs for every pipe on
 * every frame, and the closure used to be re-created 60×/s — steady garbage
 * that shows up as GC hiccups on low-end phones.
 */
function drawPipeBody(
  ctx: CanvasRenderingContext2D,
  body: HTMLImageElement,
  x: number,
  yFrom: number,
  yTo: number,
): void {
  const total = yTo - yFrom
  if (total <= 0) return
  const srcH = total / SPRITE_SCALE // source px = logical / ×3
  const col = getBodyColumn(body, Math.ceil(srcH / body.naturalHeight))
  ctx.drawImage(
    col,
    0,
    0,
    col.width,
    srcH,
    x + BODY_CORE_X * SPRITE_SCALE,
    yFrom,
    BODY_CORE_W * SPRITE_SCALE,
    total,
  )
}

/** One palette's worth of pipes — composition per the measured tile facts
 *  (see sprites.ts): bodies are the 28px tileable core of the palette, the
 *  top pipe capped with the bottom-lip cap, the bottom pipe with the top-lip
 *  cap, so both caps face the gap. */
function drawPipeSet(
  ctx: CanvasRenderingContext2D,
  set: PipeSetImages,
  s: GameState,
  horizon: number,
): void {
  const capBottomLip = set.bottom // top-pipe cap, lip at the bottom
  const capTopLip = set.top // bottom-pipe cap, lip at the top
  const body = set.center // 32x20, 28px core, tiles vertically
  const S = SPRITE_SCALE
  const capW = PIPE_CAP_W * S

  for (const p of s.pipes) {
    const x = Math.round(p.x)
    const topCapH = capBottomLip.naturalHeight * S
    const bottomCapH = capTopLip.naturalHeight * S
    const gapBottom = p.gapTop + PIPE_GAP

    // --- top pipe: body from the sky down to the cap, lip facing the gap ---
    drawPipeBody(ctx, body, x, 0, p.gapTop - topCapH)
    ctx.drawImage(capBottomLip, x, p.gapTop - topCapH, capW, topCapH)

    // --- bottom pipe: cap with lip at the top, body down to the floor ---
    ctx.drawImage(capTopLip, x, gapBottom, capW, bottomCapH)
    drawPipeBody(ctx, body, x, gapBottom + bottomCapH, horizon)
  }
}

/**
 * GAME-05 — the palette follows the score: green for 0-19, then the next
 * color every PIPE_COLOR_SCORE_STEP points, with the new palette CROSS-FADED
 * in over the old one (smooth animation, not a pop). The gap edges stay
 * exactly gapTop / gapTop + PIPE_GAP — only rendering is scaled.
 */
function drawPipes(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
  s: GameState,
): void {
  const pipeSets = sprites.pipeSets
  const toIdx = pipePalette(s, pipeSets.length)
  // Fade progress of the current palette swap (1 = settled, no double draw).
  // Reduced motion: the swap is instant (t = 1), so only one palette is drawn.
  const t = prefersReducedMotion()
    ? 1
    : Math.min(1, Math.max(0, (s.time - s.colorSwapAt) / PIPE_COLOR_FADE_S))
  const fromIdx =
    t < 1 && s.previousPipeColorIndex !== toIdx
      ? s.previousPipeColorIndex
      : toIdx
  const horizon = floorTop(s)

  drawPipeSet(ctx, pipeSets[fromIdx], s, horizon)
  if (fromIdx !== toIdx) {
    // Smooth swap: the new palette fades IN over the old one (alpha 0 → 1
    // over PIPE_COLOR_FADE_S), then the next frames draw it directly.
    ctx.globalAlpha = t
    drawPipeSet(ctx, pipeSets[toIdx], s, horizon)
    ctx.globalAlpha = 1
  }
}

/**
 * Ground strip at the BOTTOM of the view, drawn at its native pixel size and
 * repeated horizontally with the world scroll — repeated, never stretched.
 * Anything below the tile's meaningful rows simply crops off the canvas edge.
 * The tile follows s.groundIndex (the Profile ground switcher).
 */
function drawGround(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
  s: GameState,
): void {
  const tile =
    sprites.groundTiles[s.groundIndex % sprites.groundTiles.length] ??
    sprites.groundTiles[0]
  const offset = -(s.scroll % GROUND_TILE_W)
  const horizon = floorTop(s)
  for (let x = offset; x < LOGICAL_W; x += GROUND_TILE_W) {
    ctx.drawImage(tile, x, horizon)
  }
}

/**
 * The bird, centered on its position. The frame rect is read from the sheet's
 * own dimensions (naturalWidth / BIRD_FRAMES x naturalHeight) so the classic
 * 16x16 sheets and the 80x80 meme birds both work, and every skin is drawn
 * into the same on-screen box (BIRD_FRAME_W * SPRITE_SCALE = 48 logical px),
 * so switching skins never changes gameplay proportions.
 */
function drawBird(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
  s: GameState,
): void {
  const frame = birdFrame(s)
  const sheet = sprites.birdSheet
  const frameW = sheet.naturalWidth / BIRD_FRAMES
  const frameH = sheet.naturalHeight
  const size = BIRD_FRAME_W * SPRITE_SCALE
  // GAME-05 tilt: the engine eases bird.angle toward the velocity target —
  // nose-right (clockwise) while falling, back to nose-up on a click.
  ctx.save()
  ctx.translate(BIRD_X, Math.round(s.bird.y))
  ctx.rotate(s.bird.angle)
  ctx.drawImage(
    sheet,
    frame * frameW,
    0,
    frameW,
    frameH,
    -size / 2,
    -size / 2,
    size,
    size,
  )
  ctx.restore()
}

/**
 * Corpses of every bird that died this page session, rendered AFTER the
 * ground and BEFORE the active bird (required order). Each corpse keeps its
 * own skin (skinId → birdSkins index: the exact sheet the player used), its
 * final wing frame and its final -180° pose, rotated around the sprite's
 * OWN center with save/translate/rotate/drawImage/restore — never the whole
 * canvas or scene. The snapshot's x is WORLD-space: drawing at x - scroll
 * pins each corpse to the pipe slot where it died, so it lies at that spot
 * on later attempts and drifts off with the scrolling ground instead of
 * stacking in one column under the flying bird. They never move on their
 * own: the renderer only reads the frozen snapshots.
 */
function drawDeadBirds(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
  s: GameState,
): void {
  for (const d of deadBirds.all()) {
    const drawX = d.x - s.scroll
    if (drawX + d.width < 0 || drawX > LOGICAL_W) continue // off-screen
    const sheet = sprites.birdSkins[Number(d.skinId)] ?? sprites.birdSkins[0]
    if (!sheet) continue
    const frameW = sheet.naturalWidth / BIRD_FRAMES
    const frameH = sheet.naturalHeight
    ctx.save()
    ctx.translate(drawX + d.width / 2, d.y + d.height / 2)
    ctx.rotate((-180 * Math.PI) / 180)
    ctx.drawImage(
      sheet,
      d.frame * frameW,
      0,
      frameW,
      frameH,
      -d.width / 2,
      -d.height / 2,
      d.width,
      d.height,
    )
    ctx.restore()
  }
}

/**
 * Cached score-HUD layer (perf). The ready hint and the playing/dead score
 * are drawn EVERY frame, and strokeText + fillText is among the slowest
 * canvas operations on mid-range Android — so the glyphs are rasterized once
 * per change and blitted with a single drawImage. The key carries the font
 * size, the text, the backing-store scale and the webfont's availability, so
 * the layer rebuilds exactly when one of them changes — including when Press
 * Start 2P finishes loading after the first frames (checked every frame,
 * rebuilt once on the transition). Rasterizing at the CURRENT backing-store
 * scale keeps the blit 1:1 device pixels, i.e. pixel-identical to drawing
 * the text directly through the canvas transform.
 */
let hudScale = 1

/**
 * One cached text layer per HUD slot. The score layer and the ECON-03 coin
 * counter change independently (the coins change every 5 points), so they
 * cannot share one cache entry — a single shared layer would rasterize both
 * texts on every frame they disagree.
 */
interface HudLayer {
  canvas: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null
  key: string
}

const hudLayers = new Map<string, HudLayer>()

/** Horizontal padding in the layer so the 4px stroke is not clipped. */
const HUD_PAD = 8

/** Baseline inside the layer — leaves room above and below the glyphs. */
const HUD_BASELINE = 38

function drawCachedHudText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontPx: number,
  centerX: number,
  baselineY: number,
  slot = 'score',
): void {
  // Press Start 2P glyphs are 1em wide → the text is exactly text×fontPx wide.
  const textW = text.length * fontPx
  const layerW = textW + HUD_PAD * 2
  const layerH = HUD_BASELINE + 12
  const fontReady =
    typeof document.fonts?.check === 'function'
      ? document.fonts.check(`${fontPx}px "Press Start 2P"`)
      : true
  const key = `${fontPx}|${text}|${hudScale}|${fontReady}`
  let cache = hudLayers.get(slot)
  if (!cache) {
    cache = {canvas: null, ctx: null, key: ''}
    hudLayers.set(slot, cache)
  }
  if (key !== cache.key || !cache.canvas || !cache.ctx) {
    cache.key = key
    if (!cache.canvas) cache.canvas = document.createElement('canvas')
    if (!cache.ctx) cache.ctx = cache.canvas.getContext('2d')
    const layer = cache.canvas
    const lw = Math.max(1, Math.ceil(layerW * hudScale))
    const lh = Math.max(1, Math.ceil(layerH * hudScale))
    if (layer.width !== lw || layer.height !== lh) {
      layer.width = lw // assigning a size resets ctx settings — re-set below
      layer.height = lh
    }
    const lc = cache.ctx
    if (lc) {
      lc.setTransform(hudScale, 0, 0, hudScale, 0, 0) // logical px → device px
      lc.clearRect(0, 0, layerW, layerH)
      lc.imageSmoothingEnabled = false
      lc.textAlign = 'center'
      lc.textBaseline = 'alphabetic'
      lc.lineWidth = 4
      lc.strokeStyle = '#5a1e05'
      lc.fillStyle = '#ffd23f'
      lc.font = `${fontPx}px ${PIXEL_FONT}`
      lc.strokeText(text, layerW / 2, HUD_BASELINE)
      lc.fillText(text, layerW / 2, HUD_BASELINE)
    }
  }
  if (cache.canvas) {
    ctx.drawImage(
      cache.canvas,
      0,
      0,
      cache.canvas.width,
      cache.canvas.height,
      centerX - layerW / 2,
      baselineY - HUD_BASELINE,
      layerW,
      layerH,
    )
  }
}

/**
 * GAME-04 — score HUD and the Game Over screen.
 *
 * Playing: the big centered score. Ready: a start hint. Game-over: a panel
 * with the final score, the session best (best across restarts — the
 * cross-session best lives in Firestore users/{uid}.bestScore in Week 5) and
 * a restart hint; one tap anywhere restarts (handled in GameCanvas).
 */
function drawScore(ctx: CanvasRenderingContext2D, s: GameState): void {
  if (s.phase === 'ready') {
    drawCachedHudText(ctx, t('canvas.tapToFlap'), 14, LOGICAL_W / 2, 52)
    return
  }

  // During the death animation ('dead') keep the plain score HUD — the Game
  // Over panel must not cover the falling bird; it appears once the bird has
  // landed (phase 'game-over'). The same HUD stays up while the game is
  // paused and during the resume countdown: those scenes are the frozen run
  // itself, not the result panel (which must never flash over them).
  if (s.phase !== 'game-over') {
    drawCachedHudText(ctx, String(s.score), 32, LOGICAL_W / 2, 60)
    // ECON-03 preview: 1 coin per full 5 points, tucked under the score so it
    // reads as this run's tally (the top corners belong to the DEV overlay and
    // the DOM controls). It is a PREVIEW only — the balance is written by
    // submitGameResult, never by this screen.
    const preview = t('canvas.coinsHud', {
      n: coinsForScore(s.score),
    })
    drawCachedHudText(ctx, preview, 8, LOGICAL_W / 2, 88, 'coins')
    return
  }

  // C — Game Over panel: score, the real (server) personal best and, when one
  // is running, the active challenge's progress. The panel grows to fit the
  // challenge block. This frame is painted once and then frozen (GameCanvas
  // stops redrawing it), so the text is drawn straight onto the canvas: no
  // layer cache is worth it here.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const isNewBest = s.score > 0 && s.score >= s.best && s.best === s.score
  const challenge = s.challenge
  // C — a challenge that is 100% done no longer shows its progress here: the
  // title/value/bar only carry information while the numbers still move, so a
  // finished challenge collapses the panel back to its base height. The one
  // exception is the game-over that CROSSED the target: that frame still needs
  // the tall panel for its "CHALLENGE DONE!" banner (below), which is the
  // celebration — progress itself stays hidden.
  const showProgress = challenge !== null && challenge.value < challenge.target
  const showBanner = challenge !== null && isCelebrating(s)
  const panelW = 320
  const panelH = showProgress || showBanner ? 208 : 168
  const panelX = (LOGICAL_W - panelW) / 2
  // Clamped: the challenge block makes the panel taller, and on a short view
  // half the panel would otherwise slide off the top of the screen.
  const panelY = Math.max(8, s.viewH / 2 - panelH)

  ctx.fillStyle = 'rgba(90, 30, 5, 0.82)'
  ctx.strokeStyle = isCelebrating(s) ? '#8bf08b' : '#ffd23f'
  ctx.lineWidth = 3
  roundRect(ctx, panelX, panelY, panelW, panelH, 14)
  ctx.fill()
  ctx.stroke()

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffd23f'
  ctx.font = `16px ${PIXEL_FONT}`
  ctx.fillText(t('canvas.gameOver'), LOGICAL_W / 2, panelY + 40)

  ctx.font = `40px ${PIXEL_FONT}`
  ctx.strokeText(String(s.score), LOGICAL_W / 2, panelY + 92)
  ctx.fillText(String(s.score), LOGICAL_W / 2, panelY + 92)

  // Press Start 2P glyphs are 1em wide — long lines must use small sizes to
  // stay inside the 320px panel.
  ctx.font = `8px ${PIXEL_FONT}`
  ctx.fillStyle = '#fff4d6'
  // The server best is the one that matters (it survives reloads and is what
  // the leaderboard shows); the session best covers the first run.
  const best = s.serverBest > 0 ? s.serverBest : s.best
  ctx.fillText(
    isNewBest ? t('canvas.newBest', { best }) : t('canvas.best', { best }),
    LOGICAL_W / 2,
    panelY + 114,
  )

  if (challenge && showProgress) {
    // Progress is still moving — title, numbers and the bar (gold until the
    // target is reached; the `done` state itself is drawn by the banner).
    ctx.fillStyle = '#fff4d6'
    ctx.fillText(
      `${fitChallengeTitle(challenge.title)} ${challenge.value}/${challenge.target}`,
      LOGICAL_W / 2,
      panelY + 136,
    )

    // Progress bar — always visible while the challenge is unfinished.
    const barW = 260
    const barH = 10
    const barX = (LOGICAL_W - barW) / 2
    const barY = panelY + 146
    ctx.fillStyle = 'rgba(255, 244, 214, 0.25)'
    roundRect(ctx, barX, barY, barW, barH, barH / 2)
    ctx.fill()
    const pct = Math.min(1, challenge.value / challenge.target)
    if (pct > 0) {
      ctx.fillStyle = '#ffd23f'
      roundRect(ctx, barX, barY, Math.max(barH, barW * pct), barH, barH / 2)
      ctx.fill()
    }
  }

  // One-off banner on the run that finished the challenge: it pulses for a
  // few seconds, then the panel goes static again (see isCelebrating). The
  // pulse alpha comes from the wrapper (s.celebrateAlpha) because s.time is
  // frozen here; a steady 1 means no animation (reduced motion, or it is
  // over — and then the wrapper stops repainting the frozen frame).
  if (showBanner) {
    ctx.fillStyle = `rgba(139, 240, 139, ${s.celebrateAlpha})`
    ctx.font = `12px ${PIXEL_FONT}`
    ctx.fillText(t('canvas.challengeDone'), LOGICAL_W / 2, panelY + 174)
  }

  ctx.fillStyle = 'rgba(255, 244, 214, 0.75)'
  ctx.font = `8px ${PIXEL_FONT}`
  ctx.fillText(t('canvas.playAgain'), LOGICAL_W / 2, panelY + panelH - 16)
}

/**
 * Press Start 2P glyphs are 1em wide, so at 8px a title has to stay short for
 * the `${value}/${target}` suffix to fit inside the 320px panel.
 */
function fitChallengeTitle(title: string): string {
  const max = 20
  return title.length > max ? `${title.slice(0, max - 2)}..` : title
}

/** Rounded-rect path helper (ctx.roundRect is missing on older Telegram webviews). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Render one full frame of the current state (HUD last, on top). */
export function drawGame(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
  s: GameState,
): void {
  drawSky(ctx, sprites, s) // 1. background, behind everything
  drawPipes(ctx, sprites, s) // 2. pipes
  drawGround(ctx, sprites, s) // 3. ground, at the bottom of the view
  drawDeadBirds(ctx, sprites, s) // 4. corpses from earlier deaths (memory only)
  drawBird(ctx, sprites, s) // 5. active bird
  drawScore(ctx, s) // 6. score and UI, on top
}
