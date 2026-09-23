// UI-02 — shared placeholder body for screens whose backlog cards are still
// ahead (GAME-01..04, DATA-01/02, UI-03/04, CH/ADM). Keeps every future page
// visually consistent while the app shell (nav, routing, guards) already works.
import type { ReactNode } from 'react'

interface PlaceholderPageProps {
  /** Which backlog card will replace this placeholder. */
  card: string
  children?: ReactNode
}

export function PlaceholderPage({ card, children }: PlaceholderPageProps) {
  return (
    <div className="placeholder">
      {children}
      <p className="placeholder-note">
        Coming in <strong>{card}</strong>
      </p>
    </div>
  )
}
