// UI-02 + GAME-01 — the sky/background choice is shared between the Home page
// and the Game canvas: one index, persisted, broadcast via a window event so
// the canvas updates live while Home cycles it.
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'birdenergy.background'

export const BACKGROUND_CHANGE_EVENT = 'birdenergy:background-change'

export function getStoredBackgroundIndex(): number {
  const raw = localStorage.getItem(STORAGE_KEY)
  const n = raw === null ? NaN : Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : 0
}

function storeBackgroundIndex(index: number): void {
  localStorage.setItem(STORAGE_KEY, String(index))
  window.dispatchEvent(new Event(BACKGROUND_CHANGE_EVENT))
}

/** Home's handle: cycles the shared index and re-renders on external changes. */
export function useBackgroundIndex(count: number): [number, () => void] {
  const [index, setIndex] = useState(getStoredBackgroundIndex)

  useEffect(() => {
    const onChange = () => setIndex(getStoredBackgroundIndex())
    window.addEventListener(BACKGROUND_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(BACKGROUND_CHANGE_EVENT, onChange)
  }, [])

  const next = () => storeBackgroundIndex((index + 1) % count)
  return [index, next]
}
