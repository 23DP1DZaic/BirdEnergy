// Sound preferences (Music / Sound effects) — the two switches in Home's
// settings menu, stored the same way as the other player choices
// (homeBackground.ts / groundTile.ts): one localStorage flag per switch plus a
// window event, so any future audio layer can read the current choice without
// prop drilling.
//
// NOTE: the game has no audio playback yet — GAME-0x does not include sound.
// These only persist the player's preference; they are the hook the audio work
// will read when it lands (isMusicEnabled / isSfxEnabled are callable from
// anywhere, including the canvas render loop).
import { useEffect, useState } from 'react'

const MUSIC_KEY = 'birdenergy.music'
const SFX_KEY = 'birdenergy.sfx'

export const SOUND_SETTINGS_CHANGE_EVENT = 'birdenergy:sound-settings-change'

/** Default is ON: a missing/corrupt flag means "sound enabled". */
function readFlag(key: string): boolean {
  return localStorage.getItem(key) !== '0'
}

function writeFlag(key: string, on: boolean): void {
  localStorage.setItem(key, on ? '1' : '0')
  window.dispatchEvent(new Event(SOUND_SETTINGS_CHANGE_EVENT))
}

/** Current Music preference (true = on; never played yet, see the note above). */
export function isMusicEnabled(): boolean {
  return readFlag(MUSIC_KEY)
}

/** Current Sound-effects preference (true = on). */
export function isSfxEnabled(): boolean {
  return readFlag(SFX_KEY)
}

export function setMusicEnabled(on: boolean): void {
  writeFlag(MUSIC_KEY, on)
}

export function setSfxEnabled(on: boolean): void {
  writeFlag(SFX_KEY, on)
}

export interface SoundSettings {
  music: boolean
  sfx: boolean
  toggleMusic: () => void
  toggleSfx: () => void
}

/** Home's handle: both switches, kept in sync with any external change. */
export function useSoundSettings(): SoundSettings {
  const [music, setMusic] = useState(isMusicEnabled)
  const [sfx, setSfx] = useState(isSfxEnabled)

  useEffect(() => {
    const onChange = () => {
      setMusic(isMusicEnabled())
      setSfx(isSfxEnabled())
    }
    window.addEventListener(SOUND_SETTINGS_CHANGE_EVENT, onChange)
    return () =>
      window.removeEventListener(SOUND_SETTINGS_CHANGE_EVENT, onChange)
  }, [])

  return {
    music,
    sfx,
    toggleMusic: () => setMusicEnabled(!isMusicEnabled()),
    toggleSfx: () => setSfxEnabled(!isSfxEnabled()),
  }
}
