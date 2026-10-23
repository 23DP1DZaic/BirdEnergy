// AUDIO — music + sound effects for the game (and anything else that wants a
// blip).
//
// Nothing plays until audio files exist, and adding sound never touches code:
// drop a file into one of the folders below and it is picked up BY NAME.
//
//   src/assets/Sound/sfx/<name>.{mp3,ogg,wav,m4a}    → playSfx("<name>")
//   src/assets/Sound/music/<name>.{mp3,ogg,wav,m4a}  → playMusic("<name>")
//
// Names the game already asks for (any one file per name; the extension can be
// anything Vite understands, and if several are present the first is used):
//
//   sfx/flap    every jump (including the tap that starts a run)
//   sfx/score   a pipe was passed
//   sfx/hit     the collision that starts the death animation
//   sfx/die     the bird touches down
//   music/main  the menu loop, started once at app level and kept playing
//               on every screen (App.tsx)
//
// Every file is OPTIONAL: a name with no file, a failed fetch or a failed
// decode is a silent no-op, so the app behaves exactly the same with or
// without audio. The Music / Sound-effects switches in Home (soundSettings.ts)
// are read LIVE, so flipping one takes effect immediately, no restart.
//
// WebAudio on purpose: SFX are decoded once and played with ~0ms scheduling,
// while an <audio> element pays a startup cost per play that is audible in a
// tap-driven game. Browsers start the context suspended and only allow it to
// resume on a user gesture, so the context is created lazily and resumed from
// the first pointer/keyboard interaction.
import {
  SOUND_SETTINGS_CHANGE_EVENT,
  isMusicEnabled,
  isSfxEnabled,
} from './soundSettings'

/** Folders that are scanned, relative to the project root (see the note). */
export const SFX_DIR = 'src/assets/Sound/sfx'
export const MUSIC_DIR = 'src/assets/Sound/music'

/** The game's SFX names — add a file named like one and it starts playing. */
export const SFX_NAMES = ['flap', 'score', 'hit', 'die'] as const
export type SfxName = (typeof SFX_NAMES)[number]

/** Default music track: `src/assets/Sound/music/main.*`. */
export const DEFAULT_MUSIC_NAME = 'main'

/** Per-sound loudness, so a hit can be louder than a flap without file edits. */
const SFX_VOLUMES: Record<SfxName, number> = {
  flap: 0.4,
  score: 0.6,
  hit: 0.75,
  die: 0.55,
}

const MUSIC_VOLUME = 0.3

// Every audio file Vite can see, keyed by its path relative to this module.
// eager + query "?url": we only need the URL, and decoding happens lazily.
const AUDIO_URLS = import.meta.glob(
  '../assets/Sound/**/*.{mp3,ogg,wav,m4a}',
  {eager: true, query: '?url', import: 'default'},
) as Record<string, string>

/** "…/Sound/sfx/flap.mp3" → "sfx/flap" (extension-independent). */
function soundKey(path: string): string | null {
  const match = /\/Sound\/(music|sfx)\/([^/]+)\.[^/.]+$/.exec(path)
  return match ? `${match[1]}/${match[2]}` : null
}

const KEY_TO_URL = new Map<string, string>()
for (const [path, url] of Object.entries(AUDIO_URLS)) {
  const key = soundKey(path)
  // First file wins when both .mp3 and .ogg exist for the same name.
  if (key && !KEY_TO_URL.has(key)) KEY_TO_URL.set(key, url)
}

/** True once at least one audio file has been dropped into the folders. */
export function hasAudioAssets(): boolean {
  return KEY_TO_URL.size > 0
}

let context: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
/** Sounds started since page load — the DEV probe's history (see audioStatus). */
const played: SfxName[] = []
const loading = new Map<string, Promise<AudioBuffer | null>>()
let music: { source: AudioBufferSourceNode; gain: GainNode } | null = null
let wantedMusic: string | null = null
let hooksInstalled = false

type AudioContextCtor = typeof AudioContext

/** Creates the context on first use and wires the policy/toggle hooks. */
function ensureContext(): AudioContext | null {
  if (context) return context
  const ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext
  if (!ctor) return null
  context = new ctor()
  installHooks()
  return context
}

function installHooks(): void {
  if (hooksInstalled) return
  hooksInstalled = true

  // Autoplay policy: the context starts suspended and only a user gesture may
  // resume it. Both gestures the game accepts count.
  window.addEventListener('pointerdown', () => unlockAudio())
  window.addEventListener('keydown', () => unlockAudio())

  // Home's switches: turn the music off/on the moment they are flipped.
  window.addEventListener(SOUND_SETTINGS_CHANGE_EVENT, () => {
    if (isMusicEnabled()) void applyMusicState()
    else pauseMusic()
  })

  // Don't burn battery decoding/playing behind another tab.
  document.addEventListener('visibilitychange', () => {
    if (!context) return
    if (document.hidden) {
      void context.suspend()
      return
    }
    // Coming back: the platform may have suspended the context with the tab.
    // Resume it for SFX as well — gating this on the MUSIC switch left a
    // player with music off permanently silent after one tab switch.
    void unlockAudio()
  })
}

/** Fetch + decode once per key; null for a missing/undecodable file. */
function loadBuffer(key: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(key)
  if (cached) return Promise.resolve(cached)
  const pending = loading.get(key)
  if (pending) return pending

  const url = KEY_TO_URL.get(key)
  const ctx = ensureContext()
  if (!url || !ctx) return Promise.resolve(null)

  const task = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.arrayBuffer()
    })
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      buffers.set(key, buffer)
      return buffer
    })
    .catch((err: unknown) => {
      console.warn('[audio] could not decode', key, err)
      return null
    })
    .finally(() => {
      loading.delete(key)
    })

  loading.set(key, task)
  return task
}

/**
 * Resumes the audio clock. MUST be called from inside a real user gesture
 * (pointer/key handler) the first time, before any scheduled sound can be
 * heard: browsers start the context suspended. Safe to call on every tap.
 */
export function unlockAudio(): void {
  const ctx = ensureContext()
  if (!ctx || ctx.state === 'running') return
  void ctx
    .resume()
    .then(applyMusicState)
    .catch((err: unknown) => {
      console.warn('[audio] could not resume the audio context', err)
    })
}

/**
 * Pre-decodes everything so the first tap has no hitch. Safe to call at
 * mount time: with no files in the folders it resolves immediately.
 */
export async function loadAudioAssets(): Promise<void> {
  await Promise.all([...KEY_TO_URL.keys()].map((key) => loadBuffer(key)))
}

/** Plays one short sound. No-op when SFX are off or the file is missing. */
export function playSfx(name: SfxName): void {
  if (!isSfxEnabled()) return
  void loadBuffer(`sfx/${name}`).then((buffer) => {
    if (!buffer) return
    // Re-read the context (it may have been created by the decode above) and
    // push it into `running` — a context suspended by the autoplay policy or
    // by a tab switch plays nothing, and silently starting a source on it is
    // exactly the "the file is there but I hear nothing" bug.
    const ctx = ensureContext()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = SFX_VOLUMES[name] ?? 0.6
    source.connect(gain).connect(ctx.destination)
    source.start()
    played.push(name)
    if (played.length > 40) played.splice(0, played.length - 40)
  })
}

/**
 * DEV-only introspection for the audio layer: which names actually have a
 * file, which have decoded, the context state and the sounds that were
 * started. Mirrored onto window.__birdAudio by GameCanvas; the fastest way to
 * answer "I dropped die.mp3 in — why is it silent?".
 */
export interface AudioStatus {
  contextState: AudioContextState | 'unavailable'
  files: string[]
  decoded: string[]
  played: SfxName[]
  sfxEnabled: boolean
  musicEnabled: boolean
}

export function audioStatus(): AudioStatus {
  return {
    contextState: context ? context.state : 'unavailable',
    files: [...KEY_TO_URL.keys()].sort(),
    decoded: [...buffers.keys()].sort(),
    played: [...played],
    sfxEnabled: isSfxEnabled(),
    musicEnabled: isMusicEnabled(),
  }
}

/** Starts (or keeps) the looping music track. No-op when disabled/missing. */
export function playMusic(name: string = DEFAULT_MUSIC_NAME): void {
  wantedMusic = name
  void applyMusicState()
}

/** Stops the music but remembers the track as wanted (used when toggled off). */
function pauseMusic(): void {
  if (!music) return
  try {
    music.source.stop()
  } catch {
    // Already stopped — nothing to undo.
  }
  music.source.disconnect()
  music.gain.disconnect()
  music = null
}

/** Stops the music entirely (screen unmount). */
export function stopMusic(): void {
  wantedMusic = null
  pauseMusic()
}

/** Starts the wanted track if it is not already playing and still allowed. */
async function applyMusicState(): Promise<void> {
  if (!wantedMusic || !isMusicEnabled() || music) return
  const ctx = ensureContext()
  if (!ctx) return
  // A suspended context cannot make sound, and a source started in that state
  // may never be heard. Leave the track wanted — the gesture hook above calls
  // this again as soon as the context is allowed to run.
  if (ctx.state !== 'running') return

  const buffer = await loadBuffer(`music/${wantedMusic}`)
  if (!buffer || !context || context.state !== 'running') return
  // The settings may have been flipped (or the screen unmounted) while decoding.
  if (!wantedMusic || !isMusicEnabled() || music) return

  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const gain = context.createGain()
  gain.gain.value = MUSIC_VOLUME
  source.connect(gain).connect(context.destination)
  source.start()
  music = {source, gain}
}
