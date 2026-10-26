// HAPTICS — a short buzz for the moments that matter in a run.
//
// Stored and toggled exactly like the other player preferences
// (soundSettings.ts): one localStorage flag plus a window event, so Home's
// settings menu and the in-game button stay in sync without prop drilling.
//
// Every call is a no-op where it cannot work (desktop, iOS Safari, a browser
// without the Vibration API, the player turned it off), so callers never need
// to feature-test: `haptic(HAPTIC.hit)` is safe on every device.
import { useEffect, useState } from 'react'

const HAPTICS_KEY = 'birdenergy.haptics'

export const HAPTICS_CHANGE_EVENT = 'birdenergy:haptics-change'

/**
 * The patterns the game uses, in milliseconds — Vibration API semantics
 * (`navigator.vibrate(ms)` or an on/off/on pattern array).
 *
 * `flap` is missing on purpose: a buzz on every tap is noise, not feedback.
 */
export const HAPTIC = {
  /** A pipe was cleared — a soft tick. */
  score: 12,
  /** The collision that ends the run — the strongest signal in the game. */
  hit: 45,
  /** The bird hits the ground — two short pulses, the "you're out" beat. */
  die: [30, 45, 30],
  /** Leaving the pause screen into the countdown. */
  resume: 15,
} as const

export type HapticPattern = number | readonly number[]

/** Default is ON: a missing/corrupt flag means "haptics enabled". */
export function isHapticsEnabled(): boolean {
  return localStorage.getItem(HAPTICS_KEY) !== '0'
}

export function setHapticsEnabled(on: boolean): void {
  localStorage.setItem(HAPTICS_KEY, on ? '1' : '0')
  window.dispatchEvent(new Event(HAPTICS_CHANGE_EVENT))
}

/** True when this device can actually vibrate (Android Chrome/WebView mostly). */
export function isHapticsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  )
}

/** Fires one pattern, unless the player turned haptics off. Never throws. */
export function haptic(pattern: HapticPattern): void {
  if (!isHapticsSupported() || !isHapticsEnabled()) return
  try {
    navigator.vibrate(pattern as number | number[])
  } catch {
    // Some browsers expose the API but reject the call (permissions, WebView
    // policy). Feedback is optional: the game goes on silently.
  }
}

/** Home's third switch: the current choice, kept in sync with any change. */
export function useHapticsSetting(): {
  haptics: boolean
  supported: boolean
  toggleHaptics: () => void
} {
  const [haptics, setHaptics] = useState(isHapticsEnabled)

  useEffect(() => {
    const onChange = () => setHaptics(isHapticsEnabled())
    window.addEventListener(HAPTICS_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(HAPTICS_CHANGE_EVENT, onChange)
  }, [])

  return {
    haptics,
    supported: isHapticsSupported(),
    toggleHaptics: () => setHapticsEnabled(!isHapticsEnabled()),
  }
}
