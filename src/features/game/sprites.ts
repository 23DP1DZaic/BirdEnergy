// GAME-01 — sprite manifest + loader for the canvas game.
//
// Per GAME_SPEC.md ("Asset placement in code") every sprite path the game uses
// lives in this one file; components import from here, never from src/assets
// directly. Source-rect facts come from ASSETS_PLAN.md "Sprite layout
// (measured)" plus pixel measurements of the pipe tiles (2026-09-23):
//
//   Bird2-1.png        64x16  → 4 frames of 16x16, x = i*16, y = 0
//   BackgroundN.png    256x256 → seamless sky tile (one of the 9 Home skies)
//   Pipe/Green-up      32x20  → bottom-pipe cap: lip at the TOP (rows 0-14
//                                are 32px wide, rows 15-19 are 28px)
//   Pipe/Green-bottom  32x19  → top-pipe cap: lip at the BOTTOM (rows 0-2 are
//                                28px, rows 3-18 are 32px)
//   Pipe/Green-center  32x19  → body column; opaque core is 28px wide
//                                (x 2-29) and its first/last rows are
//                                identical, so it tiles vertically
//   Ground/Default     480x160 → floor strip, drawn native-size, repeat-x
//
// Vite serves these imports as URLs; loadGameSprites() turns them into
// decoded HTMLImageElements so the renderer can pass them to drawImage and
// read their natural width/height.
import birdSheetUrl from '../../assets/Player/Bird2-1.png'
import background1Url from '../../assets/Background/Background1.png'
import background2Url from '../../assets/Background/Background2.png'
import background3Url from '../../assets/Background/Background3.png'
import background4Url from '../../assets/Background/Background4.png'
import background5Url from '../../assets/Background/Background5.png'
import background6Url from '../../assets/Background/Background6.png'
import background7Url from '../../assets/Background/Background7.png'
import background8Url from '../../assets/Background/Background8.png'
import background9Url from '../../assets/Background/Background9.png'
import pipeCapUpUrl from '../../assets/Tiles/Pipe/Green-up.png'
import pipeCapBottomUrl from '../../assets/Tiles/Pipe/Green-bottom.png'
import pipeCenterUrl from '../../assets/Tiles/Pipe/Green-center.png'
import groundTileUrl from '../../assets/Tiles/Ground/Default.png'

/** Bird animation: 4 frames of 16x16 on the 64x16 sheet. */
export const BIRD_FRAMES = 4
export const BIRD_FRAME_W = 16
export const BIRD_FRAME_H = 16

/** All 9 Home skies, same order as src/sprites.ts backgrounds. */
export const gameBackgroundUrls = [
  background1Url,
  background2Url,
  background3Url,
  background4Url,
  background5Url,
  background6Url,
  background7Url,
  background8Url,
  background9Url,
] as const

/** The urls the sprite files resolve to (handy for tests/debug). */
export const gameSpriteUrls = {
  birdSheet: birdSheetUrl,
  background: background1Url,
  pipeCapUp: pipeCapUpUrl,
  pipeCapBottom: pipeCapBottomUrl,
  pipeCenter: pipeCenterUrl,
  groundTile: groundTileUrl,
} as const

export interface GameSpriteImages {
  /** All 9 skies (index-matched to the Home page's backgrounds array). */
  backgrounds: HTMLImageElement[]
  birdSheet: HTMLImageElement
  pipeCapUp: HTMLImageElement
  pipeCapBottom: HTMLImageElement
  pipeCenter: HTMLImageElement
  groundTile: HTMLImageElement
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = src
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load sprite: ${src}`))
  })
}

/** Decode every game sprite once before the render loop starts. */
export async function loadGameSprites(): Promise<GameSpriteImages> {
  const [backgrounds, birdSheet, pipeCapUp, pipeCapBottom, pipeCenter, groundTile] =
    await Promise.all([
      Promise.all(gameBackgroundUrls.map(loadImage)),
      loadImage(gameSpriteUrls.birdSheet),
      loadImage(gameSpriteUrls.pipeCapUp),
      loadImage(gameSpriteUrls.pipeCapBottom),
      loadImage(gameSpriteUrls.pipeCenter),
      loadImage(gameSpriteUrls.groundTile),
    ])
  return { backgrounds, birdSheet, pipeCapUp, pipeCapBottom, pipeCenter, groundTile }
}
