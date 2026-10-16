// Accessibility — the player's "reduce motion" preference.
//
// CSS handles the DOM animations (see the @media blocks in App.css), but the
// canvas has effects CSS cannot reach: the pipe-palette cross-fade and the
// challenge-completion banner pulse, both drawn in renderer.ts. They are read
// from here so one preference governs every motion in the game.
//
// The value is cached and kept up to date through the MediaQueryList's own
// change event, so a player who flips the setting while the app is open sees
// it take effect without a reload. Environments without matchMedia (Node, old
// webviews) simply report "no preference".
const QUERY = '(prefers-reduced-motion: reduce)'

let query: MediaQueryList | null = null
let reduced = false
let ready = false

function init(): void {
  if (ready) return
  ready = true
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }
  query = window.matchMedia(QUERY)
  reduced = query.matches
  // Older WebKit only ships the deprecated addListener form.
  const onChange = (event: MediaQueryListEvent) => {
    reduced = event.matches
  }
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange)
  } else if (typeof query.addListener === 'function') {
    query.addListener(onChange)
  }
}

/** True when the player asked the system for reduced motion. */
export function prefersReducedMotion(): boolean {
  init()
  return reduced
}
