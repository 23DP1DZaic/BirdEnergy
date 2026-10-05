// Ground skin selection — same sharing pattern as homeBackground.ts: one
// index, persisted in localStorage, broadcast via a window event so the Home
// floor and the Game canvas both swap the ground strip live. The tiles are
// the Ground/*.png files in src/assets/Tiles/Ground (Default.png and
// Snow.png, both 480x160 — identical geometry, so neither surface needs to
// change to swap them).
import { useEffect, useState } from 'react'
import { groundUrls } from '../sprites'

const STORAGE_KEY = 'birdenergy.ground'

export const GROUND_CHANGE_EVENT = 'birdenergy:ground-change'

export const GROUND_COUNT = groundUrls.length

export function getStoredGroundIndex(): number {
  const raw = localStorage.getItem(STORAGE_KEY)
  const n = raw === null ? NaN : Number(raw)
  return Number.isInteger(n) && n >= 0 && n < GROUND_COUNT ? n : 0
}

function storeGroundIndex(index: number): void {
  localStorage.setItem(STORAGE_KEY, String(index))
  window.dispatchEvent(new Event(GROUND_CHANGE_EVENT))
}

/**
 * Seeds the stored index from the users/{uid} preference (App hydrates it on
 * sign-in). A valid value wins over the local copy — the profile document is
 * the saved preference — and is ignored otherwise (missing/corrupt field).
 */
export function applyStoredGroundIndex(index: unknown): void {
  if (!Number.isInteger(index)) return
  const n = index as number
  if (n < 0 || n >= GROUND_COUNT) return
  if (getStoredGroundIndex() === n) return
  storeGroundIndex(n)
}

/** Profile's handle: cycles the shared ground index. */
export function useGroundIndex(): [number, () => void] {
  const [index, setIndex] = useState(getStoredGroundIndex)

  useEffect(() => {
    const onChange = () => setIndex(getStoredGroundIndex())
    window.addEventListener(GROUND_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(GROUND_CHANGE_EVENT, onChange)
  }, [])

  const next = () => storeGroundIndex((index + 1) % GROUND_COUNT)
  return [index, next]
}
