// Sound preferences (Music / Sound effects) — the two switches in Home's
// settings menu (and the game's pause menu), stored the same way as the other
// player choices (homeBackground.ts / groundTile.ts): one localStorage flag per
// switch plus a window event, so any future audio layer can read the current
// choice without prop drilling.
//
// Each switch has a loudness of its own (0 = silent, 1 = full): the switches
// turn a channel on/off, the volumes fine-tune it. features/audio.ts reads both
// live — every play is gated on the current preference and a change event
// starts/stops the loop or re-sets the gain immediately.
import { useEffect, useState } from 'react'

const MUSIC_KEY = 'birdenergy.music'
const SFX_KEY = 'birdenergy.sfx'
const MUSIC_VOLUME_KEY = 'birdenergy.musicVolume'
const SFX_VOLUME_KEY = 'birdenergy.sfxVolume'

export const SOUND_SETTINGS_CHANGE_EVENT = 'birdenergy:sound-settings-change'

/** Default is ON: a missing/corrupt flag means "sound enabled". */
function readFlag(key: string): boolean {
  return localStorage.getItem(key) !== '0'
}

function writeFlag(key: string, on: boolean): void {
  localStorage.setItem(key, on ? '1' : '0')
  window.dispatchEvent(new Event(SOUND_SETTINGS_CHANGE_EVENT))
}

/** Stored loudness as 0..1; a missing/corrupt value means full volume. */
function readVolume(key: string): number {
  const stored = localStorage.getItem(key)
  if (stored === null) return 1
  const value = Number(stored)
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

function writeVolume(key: string, value: number): void {
  localStorage.setItem(key, String(Math.min(1, Math.max(0, value))))
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

/** Music loudness, 0..1 (scaled onto the track's own mix level by audio.ts). */
export function getMusicVolume(): number {
  return readVolume(MUSIC_VOLUME_KEY)
}

/** Sound-effects loudness, 0..1. */
export function getSfxVolume(): number {
  return readVolume(SFX_VOLUME_KEY)
}

export function setMusicVolume(value: number): void {
  writeVolume(MUSIC_VOLUME_KEY, value)
}

export function setSfxVolume(value: number): void {
  writeVolume(SFX_VOLUME_KEY, value)
}

export interface SoundSettings {
  music: boolean
  sfx: boolean
  /** 0..1 loudness of each channel, as stored. */
  musicVolume: number
  sfxVolume: number
  toggleMusic: () => void
  toggleSfx: () => void
  setMusicVolume: (value: number) => void
  setSfxVolume: (value: number) => void
}

/** Shared handle: both switches and both volumes, kept in sync externally. */
export function useSoundSettings(): SoundSettings {
  const [music, setMusic] = useState(isMusicEnabled)
  const [sfx, setSfx] = useState(isSfxEnabled)
  const [musicVolume, setMusicVolumeState] = useState(getMusicVolume)
  const [sfxVolume, setSfxVolumeState] = useState(getSfxVolume)

  useEffect(() => {
    const onChange = () => {
      setMusic(isMusicEnabled())
      setSfx(isSfxEnabled())
      setMusicVolumeState(getMusicVolume())
      setSfxVolumeState(getSfxVolume())
    }
    window.addEventListener(SOUND_SETTINGS_CHANGE_EVENT, onChange)
    return () =>
      window.removeEventListener(SOUND_SETTINGS_CHANGE_EVENT, onChange)
  }, [])

  return {
    music,
    sfx,
    musicVolume,
    sfxVolume,
    toggleMusic: () => setMusicEnabled(!isMusicEnabled()),
    toggleSfx: () => setSfxEnabled(!isSfxEnabled()),
    setMusicVolume: (value: number) => setMusicVolume(value),
    setSfxVolume: (value: number) => setSfxVolume(value),
  }
}
