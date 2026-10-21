// One cell of the shared pixel-button sheet as an inline element.
//
// The cell is drawn whole — bevel, frame and slate face included — because it
// IS the button art. Grey_buttons.png is the resting state; the pressed twin
// (same 30-cell grid, drawn one step lower) is used for hover, for :active and
// for any control that is "on", so the sprite itself carries the state.
import { iconStyle, type IconName } from './pixelIcons'
import './pixelIcons.css'

interface PixelIconProps {
  name: IconName
  /** Rendered edge length of the 16px cell in CSS px. */
  size?: number
  /**
   * Draw the pressed cell permanently — a selected nav item, an open menu, a
   * switch that is off. Hover and press are handled by the stylesheet; this is
   * only for state the pointer cannot express.
   */
  pressed?: boolean
  className?: string
}

export function PixelIcon({
  name,
  size = 16,
  pressed = false,
  className,
}: PixelIconProps) {
  const classes = ['pixel-icon']
  if (pressed) classes.push('pixel-icon--pressed')
  if (className) classes.push(className)
  return (
    <span
      aria-hidden="true"
      className={classes.join(' ')}
      style={iconStyle(name, size)}
    />
  )
}
