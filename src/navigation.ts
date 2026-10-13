// UI-02 — app-shell navigation. The spec ("Ekrāni un navigācija") allows a
// small route structure instead of React Router, so the screen is plain state.
export type Screen =
  | 'home'
  | 'game'
  | 'leaderboard'
  | 'challenges'
  | 'profile'
  | 'admin'
  /** Reached from Home's settings menu (Info) — deliberately NOT a nav item. */
  | 'tutorial'

/**
 * Bottom-nav (mobile) / top-nav (desktop) entries in display order.
 * i18n: `labelKey` is looked up in src/i18n.ts, so the bar follows the
 * language chosen on Home / detected from Telegram.
 */
export const NAV_ITEMS: Array<{
  screen: Screen
  labelKey: string
  /** Admin Panel is reachable only for the admin role. */
  adminOnly?: boolean
}> = [
  { screen: 'challenges', labelKey: 'nav.challenges' },
  { screen: 'home', labelKey: 'nav.home' },
  { screen: 'game', labelKey: 'nav.play' },
  { screen: 'leaderboard', labelKey: 'nav.leaderboard' },
  { screen: 'profile', labelKey: 'nav.profile' },
  { screen: 'admin', labelKey: 'nav.admin', adminOnly: true },
]

