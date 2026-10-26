// Shared pixel-icon set — the 16x16 buttons in assets/Buttons/Grey_buttons.png
// (and its pressed twin), laid out in a 5x6 grid of 30 cells. One image, one
// CSS sprite: PixelIcon positions the sheet by cell index, so a new icon costs
// one number here and nothing else.
//
// Reading the sheet (row-major, 0-29):
//   0 exit door      1 hanger       2 play          3 home        4 floppy
//   5 back          6 pause         7 list          8 music       9 gamepad
//  10 music off    11 sound on     12 sound off    13 gear       14 download
//  15 refresh      16 close        17 trophy       18 mail       19 heart (outline)
//  20 check        21 trash        22 chevron down 23 chevron up 24 heart
//  25 plus         26 minus        27 locked       28 unlocked   29 info
//
// Names describe the MEANING the app gives each cell, not the file name.
//
// Cells are always drawn whole (see PixelIcon): the frame and bevel are the
// point — these are buttons, not icons. Grey_buttons.png is the resting state
// and Grey_buttons_pressed.png (same grid, art one step lower) covers hover
// and press, so the key visibly sinks.
import { type CSSProperties } from 'react'

/** Grid geometry, in source pixels — must match the sheet exactly. */
export const PIXEL_ICON_GRID = { cols: 5, rows: 6, cell: 16 } as const

export const ICONS = {
  exit: 0,
  hanger: 1,
  play: 2,
  home: 3,
  save: 4,
  back: 5,
  pause: 6,
  list: 7,
  music: 8,
  gamepad: 9,
  musicOff: 10,
  soundOn: 11,
  soundOff: 12,
  settings: 13,
  download: 14,
  refresh: 15,
  close: 16,
  trophy: 17,
  mail: 18,
  heartOutline: 19,
  check: 20,
  trash: 21,
  chevronDown: 22,
  chevronUp: 23,
  heart: 24,
  plus: 25,
  minus: 26,
  locked: 27,
  unlocked: 28,
  info: 29,
} as const

export type IconName = keyof typeof ICONS

/**
 * Cell → background geometry for a rendered size.
 *
 * Scales the 80x96 sheet so one 16px cell lands on `size`, then offsets to the
 * cell. Both sheets (resting and pressed) share this one mapping.
 */
export function iconStyle(name: IconName, size: number): CSSProperties {
  const index = ICONS[name]
  const { cell, cols, rows } = PIXEL_ICON_GRID
  const scale = size / cell
  const col = index % cols
  const row = Math.floor(index / cols)
  return {
    width: `${size}px`,
    height: `${size}px`,
    '--icon-sheet': `${cols * cell * scale}px ${rows * cell * scale}px`,
    '--icon-offset': `${-col * cell * scale}px ${-row * cell * scale}px`,
  } as CSSProperties
}
