// src/sprites.ts — pixel-art from src/assets/ referenced by components.
//
// The art is small, native-size pixel art that is meant to be tiled:
//   - Background/BackgroundN.png: 256x256 seamless sky tiles
//   - Tiles/Ground/Default.png:   480x160 seamless ground strip
// so they are drawn at their own size and repeated instead of being stretched.

import background1 from './assets/Background/Background1.png'
import background2 from './assets/Background/Background2.png'
import background3 from './assets/Background/Background3.png'
import background4 from './assets/Background/Background4.png'
import background5 from './assets/Background/Background5.png'
import background6 from './assets/Background/Background6.png'
import background7 from './assets/Background/Background7.png'
import background8 from './assets/Background/Background8.png'
import background9 from './assets/Background/Background9.png'
import background10 from './assets/Background/Background10.png'
import groundDefault from './assets/Tiles/Ground/Default.png'
import groundSnow from './assets/Tiles/Ground/Snow.png'
import logo1 from './assets/Logo/Logo1.png'

/** Sky tiles offered by the background button. Add a file here to add a sky. */
export const backgrounds: string[] = [
  background1,
  background2,
  background3,
  background4,
  background5,
  background6,
  background7,
  background8,
  background9,
  background10,
]

/** Ground strips offered by the ground button (UI-04). Add a file here to
 *  add a ground — index-matched to features/groundTile.ts and the canvas. */
export const groundUrls: string[] = [groundDefault, groundSnow]

/** Pixel-art wordmark (287x154). Swap for Logo2/Logo3/Logo4 for another style. */
export const logo: string = logo1
