// UI-02 — app-shell navigation. The spec ("Ekrāni un navigācija") allows a
// small route structure instead of React Router, so the screen is plain state.
export type Screen =
  | 'home'
  | 'game'
  | 'leaderboard'
  | 'challenges'
  | 'profile'
  | 'admin'

/** Bottom-nav (mobile) / top-nav (desktop) entries in display order. */
export const NAV_ITEMS: Array<{
  screen: Screen
  label: string
  /** Admin Panel is reachable only for the admin role. */
  adminOnly?: boolean
}> = [
  { screen: 'challenges', label: 'Challenges' },
  { screen: 'home', label: 'Home' },
  { screen: 'game', label: 'Play' },
  { screen: 'leaderboard', label: 'Leaderboard' },
  { screen: 'profile', label: 'Profile' },
  { screen: 'admin', label: 'Admin', adminOnly: true },
]

/** Title shown in a placeholder page header. */
export const SCREEN_TITLES: Record<Screen, string> = {
  home: 'Bird Energy',
  game: 'Game',
  leaderboard: 'Leaderboard',
  challenges: 'Challenges',
  profile: 'Profile',
  admin: 'Admin Panel',
}
