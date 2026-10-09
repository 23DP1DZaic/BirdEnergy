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
} from './sprites'
import {
  BIRD_X,
  deadBirds,
  floorTop,
  LOGICAL_W,
  PIPE_CAP_W,
  PIPE_GAP,
  SPRITE_SCALE,
  birdFrame,
  pipeColorIndex,
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
export function configureCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false
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
let bodyColumn: HTMLCanvasElement | null = null
let bodyColumnImg: HTMLImageElement | null = null

function getBodyColumn(
  body: HTMLImageElement,
  tiles: number,
): HTMLCanvasElement {
  const tileH = body.naturalHeight
  const needH = Math.max(1, tiles) * tileH
  if (!bodyColumn || bodyColumnImg !== body || bodyColumn.height < needH) {
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
    bodyColumn = col
    bodyColumnImg = body
  }
  return bodyColumn
}

/**
 * One pipe pair at SPRITE_SCALE. Composition per the measured tile facts
 * (see sprites.ts): bodies are the 28px-wide tileable core of the current
 * palette, capped with the bottom-lip cap on top and the top-lip cap below,
 * so both caps face the gap. GAME-05 — the palette follows the score: green
 * for 0-19, then the next color every PIPE_COLOR_SCORE_STEP points. The gap
 * edges stay exactly gapTop / gapTop + PIPE_GAP — only rendering is scaled.
 */
function drawPipes(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
  s: GameState,
): void {
  const set = sprites.pipeSets[pipeColorIndex(s, sprites.pipeSets.length)]
  const capBottomLip = set.bottom // top-pipe cap, lip at the bottom
  const capTopLip = set.top // bottom-pipe cap, lip at the top
  const body = set.center // 32x20, 28px core, tiles vertically
  const horizon = floorTop(s)
  const S = SPRITE_SCALE
  const capW = PIPE_CAP_W * S
  const bodyW = BODY_CORE_W * S

  /**
   * Body column from yFrom down to yTo (logical px) — ONE clipped drawImage
   * from the cached repeated-tile column (below) instead of a ~10-iteration
   * tiling loop per pipe (that was 40-50 drawImage calls per frame during
   * play). Pixel output is identical: the column holds the same tile rows at
   * the same 28px-core source width and the same ×3 vertical scale.
   */
  const drawBody = (x: number, yFrom: number, yTo: number) => {
    const total = yTo - yFrom
    if (total <= 0) return
    const srcH = total / S // source px = logical / ×3
    const col = getBodyColumn(body, Math.ceil(srcH / body.naturalHeight))
    ctx.drawImage(col, 0, 0, col.width, srcH, x + BODY_CORE_X * S, yFrom, bodyW, total)
  }

  for (const p of s.pipes) {
    const x = Math.round(p.x)
    const topCapH = capBottomLip.naturalHeight * S
    const bottomCapH = capTopLip.naturalHeight * S
    const gapBottom = p.gapTop + PIPE_GAP

    // --- top pipe: body from the sky down to the cap, lip facing the gap ---
    drawBody(x, 0, p.gapTop - topCapH)
    ctx.drawImage(capBottomLip, x, p.gapTop - topCapH, capW, topCapH)

    // --- bottom pipe: cap with lip at the top, body down to the floor ---
    ctx.drawImage(capTopLip, x, gapBottom, capW, bottomCapH)
    drawBody(x, gapBottom + bottomCapH, horizon)
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
 * canvas or scene. They never move: the renderer only reads the frozen
 * snapshots.
 */
function drawDeadBirds(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
): void {
  for (const d of deadBirds) {
    const sheet = sprites.birdSkins[Number(d.skinId)] ?? sprites.birdSkins[0]
    if (!sheet) continue
    const frameW = sheet.naturalWidth / BIRD_FRAMES
    const frameH = sheet.naturalHeight
    ctx.save()
    ctx.translate(d.x + d.width / 2, d.y + d.height / 2)
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
 * GAME-04 — score HUD and the Game Over screen.
 *
 * Playing: the big centered score. Ready: a start hint. Game-over: a panel
 * with the final score, the session best (best across restarts — the
 * cross-session best lives in Firestore users/{uid}.bestScore in Week 5) and
 * a restart hint; one tap anywhere restarts (handled in GameCanvas).
 */
function drawScore(ctx: CanvasRenderingContext2D, s: GameState): void {
  ctx.textAlign = 'center'
  ctx.lineWidth = 4
  ctx.strokeStyle = '#5a1e05'
  ctx.fillStyle = '#ffd23f'

  if (s.phase === 'ready') {
    ctx.font = `14px ${PIXEL_FONT}`
    ctx.strokeText('Tap to flap', LOGICAL_W / 2, 52)
    ctx.fillText('Tap to flap', LOGICAL_W / 2, 52)
    return
  }

  // During the death animation ('dead') keep the plain score HUD — the Game
  // Over panel must not cover the falling bird; it appears once the bird has
  // landed (phase 'game-over').
  if (s.phase === 'playing' || s.phase === 'dead') {
    ctx.font = `32px ${PIXEL_FONT}`
    ctx.strokeText(String(s.score), LOGICAL_W / 2, 60)
    ctx.fillText(String(s.score), LOGICAL_W / 2, 60)
    return
  }

  // Game Over panel
  const isNewBest = s.score > 0 && s.score >= s.best && s.best === s.score
  const panelW = 320
  const panelH = 168
  const panelX = (LOGICAL_W - panelW) / 2
  const panelY = s.viewH / 2 - panelH

  ctx.fillStyle = 'rgba(90, 30, 5, 0.82)'
  ctx.strokeStyle = '#ffd23f'
  ctx.lineWidth = 3
  roundRect(ctx, panelX, panelY, panelW, panelH, 14)
  ctx.fill()
  ctx.stroke()

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffd23f'
  ctx.font = `16px ${PIXEL_FONT}`
  ctx.fillText('Game Over', LOGICAL_W / 2, panelY + 44)

  ctx.font = `40px ${PIXEL_FONT}`
  ctx.strokeText(String(s.score), LOGICAL_W / 2, panelY + 102)
  ctx.fillText(String(s.score), LOGICAL_W / 2, panelY + 102)

  // Press Start 2P glyphs are 1em wide — long lines must use small sizes to
  // stay inside the 320px panel.
  ctx.font = `8px ${PIXEL_FONT}`
  ctx.fillStyle = '#fff4d6'
  ctx.fillText(
    isNewBest ? `NEW BEST! (${s.best})` : `BEST THIS RUN: ${s.best}`,
    LOGICAL_W / 2,
    panelY + 130,
  )
  ctx.fillStyle = 'rgba(255, 244, 214, 0.75)'
  ctx.fillText('TAP TO PLAY AGAIN', LOGICAL_W / 2, panelY + 152)
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
  drawDeadBirds(ctx, sprites) // 4. corpses from earlier deaths (memory only)
  drawBird(ctx, sprites, s) // 5. active bird
  drawScore(ctx, s) // 6. score and UI, on top
}
