// UI-02 — app-shell navigation. The spec ("Ekrāni un navigācija") allows a
// small route structure instead of React Router, so the screen is plain state.
import type { IconName } from './features/ui/pixelIcons'

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
  /** Sprite cell from the shared pixel-button sheet (features/ui/PixelIcon). */
  icon: IconName
  /** Admin Panel is reachable only for the admin role. */
  adminOnly?: boolean
}> = [
  { screen: 'challenges', labelKey: 'nav.challenges', icon: 'list' },
  { screen: 'home', labelKey: 'nav.home', icon: 'home' },
  { screen: 'game', labelKey: 'nav.play', icon: 'gamepad' },
  { screen: 'leaderboard', labelKey: 'nav.leaderboard', icon: 'trophy' },
  { screen: 'profile', labelKey: 'nav.profile', icon: 'heart' },
  { screen: 'admin', labelKey: 'nav.admin', icon: 'settings', adminOnly: true },
]

