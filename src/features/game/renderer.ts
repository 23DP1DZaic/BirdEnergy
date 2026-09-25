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
  BIRD_FRAME_H,
  BIRD_FRAME_W,
  type GameSpriteImages,
} from './sprites'
import {
  BIRD_X,
  floorTop,
  LOGICAL_W,
  PIPE_CAP_W,
  PIPE_GAP,
  SPRITE_SCALE,
  birdFrame,
  type GameState,
} from './engine'

const GROUND_TILE_W = 480

/** Pixel-art crispness: nearest-neighbour everywhere. */
export function configureCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false
}

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
  const pat = ctx.createPattern(bg, 'repeat-x')
  if (!pat) return
  const scale = horizon / bg.naturalHeight
  const m = new DOMMatrix()
  m.translateSelf(-(s.scroll % (bg.naturalWidth * scale)), 0)
  m.scaleSelf(scale, scale)
  pat.setTransform(m)
  ctx.fillStyle = pat
  ctx.fillRect(0, 0, LOGICAL_W, horizon)
}

/**
 * One pipe pair at SPRITE_SCALE. Composition per the measured tile facts
 * (see sprites.ts): bodies are the 28px-wide tileable core of Green-center,
 * capped with Green-bottom (lip at bottom) on top and Green-up (lip at top)
 * below, so both caps face the gap. The gap edges stay exactly gapTop /
 * gapTop + PIPE_GAP — only the rendering is scaled.
 */
function drawPipes(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
  s: GameState,
): void {
  const capBottomLip = sprites.pipeCapBottom // top-pipe cap, lip at the bottom
  const capTopLip = sprites.pipeCapUp // bottom-pipe cap, lip at the top
  const body = sprites.pipeCenter // 32x19, 28px core, tiles vertically
  const horizon = floorTop(s)
  const S = SPRITE_SCALE
  const capW = PIPE_CAP_W * S
  const bodyW = 28 * S
  const bodyTileH = body.naturalHeight * S

  /** Body column from yFrom down to yTo (logical px), tiled from the core. */
  const drawBody = (x: number, yFrom: number, yTo: number) => {
    const total = yTo - yFrom
    for (let off = 0; off < total; off += bodyTileH) {
      const destH = Math.min(bodyTileH, total - off)
      ctx.drawImage(
        body,
        2,
        0,
        28,
        destH / S,
        x + 2 * S,
        yFrom + off,
        bodyW,
        destH,
      )
    }
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
 */
function drawGround(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
  s: GameState,
): void {
  const tile = sprites.groundTile
  const offset = -(s.scroll % GROUND_TILE_W)
  const horizon = floorTop(s)
  for (let x = offset; x < LOGICAL_W; x += GROUND_TILE_W) {
    ctx.drawImage(tile, x, horizon)
  }
}

/** The bird: one 16x16 sheet frame drawn at SPRITE_SCALE, centered on its position. */
function drawBird(
  ctx: CanvasRenderingContext2D,
  sprites: GameSpriteImages,
  s: GameState,
): void {
  const frame = birdFrame(s)
  const size = BIRD_FRAME_W * SPRITE_SCALE
  ctx.drawImage(
    sprites.birdSheet,
    frame * BIRD_FRAME_W,
    0,
    BIRD_FRAME_W,
    BIRD_FRAME_H,
    BIRD_X - size / 2,
    Math.round(s.bird.y - size / 2),
    size,
    size,
  )
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
    ctx.font = 'bold 28px system-ui, sans-serif'
    ctx.strokeText('Tap to flap', LOGICAL_W / 2, 48)
    ctx.fillText('Tap to flap', LOGICAL_W / 2, 48)
    return
  }

  if (s.phase === 'playing') {
    ctx.font = 'bold 36px system-ui, sans-serif'
    ctx.strokeText(String(s.score), LOGICAL_W / 2, 56)
    ctx.fillText(String(s.score), LOGICAL_W / 2, 56)
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
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.fillText('Game Over', LOGICAL_W / 2, panelY + 44)

  ctx.font = 'bold 48px system-ui, sans-serif'
  ctx.strokeText(String(s.score), LOGICAL_W / 2, panelY + 102)
  ctx.fillText(String(s.score), LOGICAL_W / 2, panelY + 102)

  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.fillStyle = '#fff4d6'
  ctx.fillText(
    isNewBest ? `New best! (session best ${s.best})` : `Best this session: ${s.best}`,
    LOGICAL_W / 2,
    panelY + 130,
  )
  ctx.fillStyle = 'rgba(255, 244, 214, 0.75)'
  ctx.fillText('Tap to play again', LOGICAL_W / 2, panelY + 154)
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
  drawSky(ctx, sprites, s) // background, behind everything
  drawPipes(ctx, sprites, s)
  drawGround(ctx, sprites, s) // ground, at the bottom of the view
  drawBird(ctx, sprites, s)
  drawScore(ctx, s)
}
