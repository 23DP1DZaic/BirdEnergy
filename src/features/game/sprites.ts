// GAME-01 — sprite manifest + loader for the canvas game.
//
// Per GAME_SPEC.md ("Asset placement in code") every sprite path the game uses
// lives in this one file; components import from here, never from src/assets
// directly. Source-rect facts come from ASSETS_PLAN.md "Sprite layout
// (measured)" plus pixel measurements of the pipe tiles (2026-09-23):
//
//   Bird2-1.png        64x16  → 4 frames of 16x16, x = i*16, y = 0
//   KirkBird/LitvinBird 320x80 → 4 frames of 80x80 (MellBird is 316x81 —
//                         frame width is naturalWidth/4, read from the sheet)
//   BackgroundN.png    256x256 → seamless sky tile (one of the 9 Home skies)
//   Pipe/Green-top     32x20  → bottom-pipe cap: lip at the TOP (rows 0-15
//                                are 32px wide, rows 16-19 are 28px)
//   Pipe/Green-bot     32x20  → top-pipe cap: lip at the BOTTOM (rows 0-3
//                                are 28px wide, rows 4-19 are 32px)
//   Pipe/Green-mid     32x20  → body column; opaque core is 28px wide
//                                (x 2-29) and its first/last rows are
//                                identical, so it tiles vertically
//   Ground/Default     480x160 → floor strip, drawn native-size, repeat-x
//
// Vite serves these imports as URLs; loadGameSprites() turns them into
// decoded HTMLImageElements so the renderer can pass them to drawImage and
// read their natural width/height.
import birdSheetUrl from '../../assets/Player/Bird2-1.png'
// Bird skins: seven 64x16 sheets (4 frames of 16x16), same geometry as the
// default — the skin selector (features/birdSkin.ts) swaps between them.
import birdSkin1Url from '../../assets/Player/Bird2-1.png'
import birdSkin2Url from '../../assets/Player/Bird2-2.png'
import birdSkin3Url from '../../assets/Player/Bird2-3.png'
import birdSkin4Url from '../../assets/Player/Bird2-4.png'
import birdSkin5Url from '../../assets/Player/Bird2-5.png'
import birdSkin6Url from '../../assets/Player/Bird2-6.png'
import birdSkin7Url from '../../assets/Player/Bird2-7.png'
import birdSkin8Url from '../../assets/Player/KirkBird.png'
import birdSkin9Url from '../../assets/Player/LitvinBird.png'
import birdSkin10Url from '../../assets/Player/MellBird.png'
import background1Url from '../../assets/Background/Background1.png'
import background2Url from '../../assets/Background/Background2.png'
import background3Url from '../../assets/Background/Background3.png'
import background4Url from '../../assets/Background/Background4.png'
import background5Url from '../../assets/Background/Background5.png'
import background6Url from '../../assets/Background/Background6.png'
import background7Url from '../../assets/Background/Background7.png'
import background8Url from '../../assets/Background/Background8.png'
import background9Url from '../../assets/Background/Background9.png'
<<<<<<< HEAD
// pipe assets were moved into per-color folders (Pipe/Green/Green-top.png,
// Green-mid.png, Green-bot.png — the old Green-up/-bottom/-center names).
import pipeCapUpUrl from '../../assets/Tiles/Pipe/Green/Green-top.png'
import pipeCapBottomUrl from '../../assets/Tiles/Pipe/Green/Green-bot.png'
import pipeCenterUrl from '../../assets/Tiles/Pipe/Green/Green-mid.png'
// GAME-05 — the other pipe palettes. Every set is 32x20 with the same lip
// layout as Green (verified with `file`), so the renderer can swap sets.
import pipeBlueTopUrl from '../../assets/Tiles/Pipe/Blue/Blue-top.png'
import pipeBlueBotUrl from '../../assets/Tiles/Pipe/Blue/Blue-bot.png'
import pipeBlueMidUrl from '../../assets/Tiles/Pipe/Blue/Blue-mid.png'
import pipeRedTopUrl from '../../assets/Tiles/Pipe/Red/Red-top.png'
import pipeRedBotUrl from '../../assets/Tiles/Pipe/Red/Red-bot.png'
import pipeRedMidUrl from '../../assets/Tiles/Pipe/Red/Red-mid.png'
import pipeYellowTopUrl from '../../assets/Tiles/Pipe/Yellow/Yellow-top.png'
import pipeYellowBotUrl from '../../assets/Tiles/Pipe/Yellow/Yellow-bot.png'
import pipeYellowMidUrl from '../../assets/Tiles/Pipe/Yellow/Yellow-mid.png'
import pipePurpleTopUrl from '../../assets/Tiles/Pipe/Purple/Purple-top.png'
import pipePurpleBotUrl from '../../assets/Tiles/Pipe/Purple/Purple-bot.png'
import pipePurpleMidUrl from '../../assets/Tiles/Pipe/Purple/Purple-mid.png'
import pipeOrangeTopUrl from '../../assets/Tiles/Pipe/Orange/Orange-top.png'
import pipeOrangeBotUrl from '../../assets/Tiles/Pipe/Orange/Orange-bot.png'
import pipeOrangeMidUrl from '../../assets/Tiles/Pipe/Orange/Orange-mid.png'
import pipeWhiteTopUrl from '../../assets/Tiles/Pipe/White/White-top.png'
import pipeWhiteBotUrl from '../../assets/Tiles/Pipe/White/White-bot.png'
import pipeWhiteMidUrl from '../../assets/Tiles/Pipe/White/White-mid.png'
import pipeBrownTopUrl from '../../assets/Tiles/Pipe/Brown/Brown-top.png'
import pipeBrownBotUrl from '../../assets/Tiles/Pipe/Brown/Brown-bot.png'
import pipeBrownMidUrl from '../../assets/Tiles/Pipe/Brown/Brown-mid.png'
=======
import pipeCapUpUrl from "../../assets/Tiles/Pipe/Green/Green-top.png";
import pipeCapBottomUrl from "../../assets/Tiles/Pipe/Green/Green-bot.png";
import pipeCenterUrl from "../../assets/Tiles/Pipe/Green/Green-mid.png";
>>>>>>> 403b8a9f0b6cf6536a50d170834e2f730b8fa2b6
import groundTileUrl from '../../assets/Tiles/Ground/Default.png'
import groundSnowUrl from '../../assets/Tiles/Ground/Snow.png'

/** Bird animation: 4 frames per sheet. The default sheets are 64x16 (frames
 *  16x16); the meme birds are 320x80 / 316x81 (frames ~80x80). The renderer
 *  reads frame width as sheet.naturalWidth / BIRD_FRAMES so both geometries
 *  work — BIRD_FRAME_W/H only describe the default sheet and the on-screen
 *  draw size (BIRD_FRAME_W * SPRITE_SCALE for every skin). */
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

/** The selectable bird skins; index-matched to birdSkin.ts. The first seven
 *  are the classic 16x16 sheets, the last three the 80x80 meme birds. */
export const birdSkinUrls = [
  birdSkin1Url,
  birdSkin2Url,
  birdSkin3Url,
  birdSkin4Url,
  birdSkin5Url,
  birdSkin6Url,
  birdSkin7Url,
  birdSkin8Url,
  birdSkin9Url,
  birdSkin10Url,
] as const

/** The ground strips (Default, Snow), index-matched to features/groundTile.ts. */
export const groundTileUrls = [groundTileUrl, groundSnowUrl] as const

/**
 * GAME-05 — pipe palettes in rotation order: every PIPE_COLOR_SCORE_STEP
 * (20) points the game switches to the next set; score 0-19 is green.
 * `top` = lip at the top (bottom-pipe cap), `bottom` = lip at the bottom
 * (top-pipe cap), `center` = the tileable 32x20 body.
 */
export const pipeColorUrls = [
  { name: 'Green', top: pipeCapUpUrl, bottom: pipeCapBottomUrl, center: pipeCenterUrl },
  { name: 'Blue', top: pipeBlueTopUrl, bottom: pipeBlueBotUrl, center: pipeBlueMidUrl },
  { name: 'Red', top: pipeRedTopUrl, bottom: pipeRedBotUrl, center: pipeRedMidUrl },
  { name: 'Yellow', top: pipeYellowTopUrl, bottom: pipeYellowBotUrl, center: pipeYellowMidUrl },
  { name: 'Purple', top: pipePurpleTopUrl, bottom: pipePurpleBotUrl, center: pipePurpleMidUrl },
  { name: 'Orange', top: pipeOrangeTopUrl, bottom: pipeOrangeBotUrl, center: pipeOrangeMidUrl },
  { name: 'White', top: pipeWhiteTopUrl, bottom: pipeWhiteBotUrl, center: pipeWhiteMidUrl },
  { name: 'Brown', top: pipeBrownTopUrl, bottom: pipeBrownBotUrl, center: pipeBrownMidUrl },
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

/** One pipe palette: the three 32x20 tiles of a single color. */
export interface PipeSetImages {
  /** `<Color>-top.png` — lip at the TOP (bottom-pipe cap). */
  top: HTMLImageElement
  /** `<Color>-bot.png` — lip at the BOTTOM (top-pipe cap). */
  bottom: HTMLImageElement
  /** `<Color>-mid.png` — the tileable body (28px core). */
  center: HTMLImageElement
}

export interface GameSpriteImages {
  /** All 9 skies (index-matched to the Home page's backgrounds array). */
  backgrounds: HTMLImageElement[]
  /** Currently active bird sheet — swapped live by the skin selector. */
  birdSheet: HTMLImageElement
  /** All skins, pre-decoded; birdSkins[getStoredBirdSkinIndex()] is the
   *  active one. Same order as birdSkinUrls / the birdSkin.ts index. */
  birdSkins: HTMLImageElement[]
  /** All pipe palettes, index-matched with pipeColorUrls — the renderer
   *  picks pipeSets[pipeColorIndex(score)] (GAME-05 color rotation). */
  pipeSets: PipeSetImages[]
  /** All ground strips (index-matched to groundTile.ts); the renderer picks
   *  groundTiles[s.groundIndex]. */
  groundTiles: HTMLImageElement[]
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
  const [backgrounds, birdSheets, pipeSets, groundTiles] = await Promise.all([
    Promise.all(gameBackgroundUrls.map(loadImage)),
    Promise.all(birdSkinUrls.map(loadImage)),
    Promise.all(
      pipeColorUrls.map(async (urls) => ({
        top: await loadImage(urls.top),
        bottom: await loadImage(urls.bottom),
        center: await loadImage(urls.center),
      })),
    ),
    Promise.all(groundTileUrls.map(loadImage)),
  ])
  return {
    backgrounds,
    birdSkins: birdSheets,
    birdSheet: birdSheets[0],
    pipeSets,
    groundTiles,
  }
}
