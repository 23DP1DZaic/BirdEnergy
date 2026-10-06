// Bird skin selection — same sharing pattern as homeBackground.ts: one index,
// persisted in localStorage, broadcast via a window event so the Game canvas
// swaps the sprite live while Home cycles it. The skins are the seven
// Bird2-N.png sheets in src/assets/Player (each 64x16 = 4 frames of 16x16,
// identical geometry, so the game renderer needs no changes to swap them).
import { useEffect, useState } from 'react'
import { birdSkinUrls } from './game/sprites'

const STORAGE_KEY = 'birdenergy.birdSkin'

export const BIRD_SKIN_CHANGE_EVENT = 'birdenergy:bird-skin-change'

export const BIRD_SKIN_COUNT = birdSkinUrls.length

export function getStoredBirdSkinIndex(): number {
  const raw = localStorage.getItem(STORAGE_KEY)
  const n = raw === null ? NaN : Number(raw)
  return Number.isInteger(n) && n >= 0 && n < BIRD_SKIN_COUNT ? n : 0
}

function storeBirdSkinIndex(index: number): void {
  localStorage.setItem(STORAGE_KEY, String(index))
  window.dispatchEvent(new Event(BIRD_SKIN_CHANGE_EVENT))
}

/**
 * Seeds the stored index from the users/{uid} preference (App hydrates it on
 * sign-in). A valid value wins over the local copy — the profile document is
 * the saved preference — and is ignored otherwise (missing/corrupt field).
 */
export function applyStoredBirdSkinIndex(index: unknown): void {
  if (!Number.isInteger(index)) return
  const n = index as number
  if (n < 0 || n >= BIRD_SKIN_COUNT) return
  if (getStoredBirdSkinIndex() === n) return
  storeBirdSkinIndex(n)
}

/** Home's handle: cycles the shared skin index and re-renders on changes. */
export function useBirdSkinIndex(): [number, () => void] {
  const [index, setIndex] = useState(getStoredBirdSkinIndex)

  useEffect(() => {
    const onChange = () => setIndex(getStoredBirdSkinIndex())
    window.addEventListener(BIRD_SKIN_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(BIRD_SKIN_CHANGE_EVENT, onChange)
  }, [])

  const next = () => storeBirdSkinIndex((index + 1) % BIRD_SKIN_COUNT)
  return [index, next]
}
