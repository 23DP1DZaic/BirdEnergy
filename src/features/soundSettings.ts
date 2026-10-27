// Sound preferences (Music / Sound effects) — the two switches in Home's
// settings menu, stored the same way as the other player choices
// (homeBackground.ts / groundTile.ts): one localStorage flag per switch plus a
// window event, so any future audio layer can read the current choice without
// prop drilling.
//
// features/audio.ts reads these live: every play is gated on the current
// preference and a change event starts/stops the loop immediately.
import { useEffect, useState } from 'react'

const MUSIC_KEY = 'birdenergy.music'
const SFX_KEY = 'birdenergy.sfx'

export const SOUND_SETTINGS_CHANGE_EVENT = 'birdenergy:sound-settings-change'
const MUSIC_VOLUME_KEY = 'birdenergy.musicVolume'
const SFX_VOLUME_KEY = 'birdenergy.sfxVolume'

function readVolume(key: string, fallback: number): number {
  const saved = localStorage.getItem(key)

  if (saved === null) return fallback

  const value = Number(saved)

  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, Math.min(1, value))
}

function writeVolume(key: string, value: number): void {
  if (!Number.isFinite(value)) return

  const volume = Math.max(0, Math.min(1, value))
  localStorage.setItem(key, String(volume))
  window.dispatchEvent(new Event(SOUND_SETTINGS_CHANGE_EVENT))
}

export function getMusicVolume(): number {
  return readVolume(MUSIC_VOLUME_KEY, 1)
}

export function getSfxVolume(): number {
  return readVolume(SFX_VOLUME_KEY, 0.6)
}

export function setMusicVolume(value: number): void {
  writeVolume(MUSIC_VOLUME_KEY, value)
}

export function setSfxVolume(value: number): void {
  writeVolume(SFX_VOLUME_KEY, value)
}

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
  musicVolume: number
  sfxVolume: number
  toggleMusic: () => void
  toggleSfx: () => void
  setMusicVolume: (value: number) => void
  setSfxVolume: (value: number) => void
}

export function useSoundSettings(): SoundSettings {
  const [music, setMusic] = useState(isMusicEnabled)
  const [sfx, setSfx] = useState(isSfxEnabled)

  const [musicVolume, setMusicVolumeState] =
    useState<number>(() => getMusicVolume())
  const [sfxVolume, setSfxVolumeState] =
    useState<number>(() => getSfxVolume())

  useEffect(() => {
    const onChange = () => {
      setMusic(isMusicEnabled())
      setSfx(isSfxEnabled())
      setMusicVolumeState(getMusicVolume())
      setSfxVolumeState(getSfxVolume())
    }

    window.addEventListener(SOUND_SETTINGS_CHANGE_EVENT, onChange)

    return () => {
      window.removeEventListener(SOUND_SETTINGS_CHANGE_EVENT, onChange)
    }
  }, [])

  return {
    music,
    sfx,
    musicVolume,
    sfxVolume,
    toggleMusic: () => setMusicEnabled(!isMusicEnabled()),
    toggleSfx: () => setSfxEnabled(!isSfxEnabled()),
    setMusicVolume,
    setSfxVolume,
  }
}
