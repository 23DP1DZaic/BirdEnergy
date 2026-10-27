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
//   sfx/die     the death fall is most of the way down — a beat before
//               touchdown, so the cue is felt WITH the crash
//   music/main  the looping background track — streamed through an <audio>
//               element and started/stopped by the game screen as a run
//               starts and ends (GameCanvas.tsx)
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
  getMusicVolume,
  getSfxVolume,
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

// The track is mastered quietly (peak -1.5 dBFS after normalisation, mean
// -14.7 dB), so the loop needs a higher mix level than the short SFX to be
// heard at all on a phone speaker. 0.45 lands the loop around -21 dB mean,
// clearly under the transient hits but audible.
const MUSIC_VOLUME = 0.45

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
/** The looping track: an element, never an AudioBuffer (see applyMusicState). */
let musicEl: HTMLAudioElement | null = null
let musicName: string | null = null
let wantedMusic: string | null = null
let hooksInstalled = false
/** Last play() rejection, shown by the on-screen audio panel (musicDebug). */
let lastPlayError: string | null = null

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

  // Autoplay policy: the context starts suspended and a track may only start
  // from a real gesture. Both gestures the game accepts count — and each one
  // also retries the loop, because the run starts the music on the frame AFTER
  // the tap that began it, where play() may no longer count as a gesture.
  const onGesture = () => {
    unlockAudio()
    void applyMusicState()
  }
  window.addEventListener('pointerdown', onGesture)
  window.addEventListener('keydown', onGesture)

  // The switches and volume sliders: react the moment they are moved — start
  // or stop the loop, and re-set the running track's volume (no restart, so a
  // slider drag never re-cues the loop from its first sample).
  window.addEventListener(SOUND_SETTINGS_CHANGE_EVENT, () => {
    if (musicEl) musicEl.volume = musicLevel()
    if (isMusicEnabled()) void applyMusicState()
    else pauseMusic()
  })

  // Don't burn battery playing behind another tab.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseMusic()
      if (context) void context.suspend()
      return
    }
    // Coming back: the platform may have suspended the context with the tab.
    // Resume it for SFX as well — gating this on the MUSIC switch left a
    // player with music off permanently silent after one tab switch.
    unlockAudio()
    void applyMusicState()
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
  // SFX only: the music track is streamed, and decoding it here would cost
  // tens of megabytes of RAM before the first frame of the game.
  await Promise.all(
    [...KEY_TO_URL.keys()]
      .filter((key) => key.startsWith('sfx/'))
      .map((key) => loadBuffer(key)),
  )
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
    gain.gain.value = (SFX_VOLUMES[name] ?? 0.6) * getSfxVolume()
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

/** Pauses the music but remembers the track as wanted (toggle off, tab away). */
export function pauseMusic(): void {
  musicEl?.pause()
}

/** Stops the music entirely and rewinds it (leave the screen). */
export function stopMusic(): void {
  wantedMusic = null
  if (!musicEl) return
  musicEl.pause()
  // Rewinding an element without metadata throws in some WebViews.
  try {
    musicEl.currentTime = 0
  } catch {
    // Nothing loaded yet — there is no position to rewind.
  }
}

/** Music loudness, 0..1 — the track's own mix level scaled by the slider. */
function musicLevel(): number {
  return MUSIC_VOLUME * getMusicVolume()
}

/** The element for `name`, created once per track and then reused. */
function ensureMusicElement(name: string): HTMLAudioElement | null {
  const url = KEY_TO_URL.get(`music/${name}`)
  if (!url) return null
  if (musicEl && musicName === name) return musicEl
  musicEl?.pause()
  const el = new Audio(url)
  el.loop = true
  el.preload = 'auto'
  el.volume = musicLevel()
  // Keep the track inside the page instead of the native fullscreen player.
  el.setAttribute('playsinline', '')
  // A first play() that lands before the media is buffered rejects with
  // NotSupportedError on some WebViews; retry as soon as it can play.
  el.addEventListener('canplay', () => {
    if (el.paused && wantedMusic && isMusicEnabled()) void applyMusicState()
  })
  musicEl = el
  musicName = name
  return el
}

/**
 * Starts the wanted track if it is not already playing and still allowed.
 *
 * Music streams through an <audio> element instead of WebAudio on purpose:
 * decoding a multi-megabyte loop into an AudioBuffer costs tens of megabytes
 * of RAM and seconds of silence on a phone, and a WebView that refuses the
 * decode leaves the game permanently quiet. An element plays while it is still
 * downloading and idles for free.
 */
async function applyMusicState(): Promise<void> {
  if (!wantedMusic || !isMusicEnabled()) return
  const el = ensureMusicElement(wantedMusic)
  if (!el) return
  el.volume = musicLevel()
  if (!el.paused) return
  try {
    await el.play()
    lastPlayError = null
  } catch (err) {
    // Autoplay policy (or a network hiccup): the track stays wanted and the
    // gesture hook retries it on the next tap. The reason is kept for the
    // on-screen audio panel — a phone has no console.
    lastPlayError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }
}

/** Everything the on-screen audio panel shows about the music channel. */
export interface MusicDebug {
  musicEnabled: boolean
  volumeSetting: number
  wanted: string | null
  hasElement: boolean
  src: string | null
  paused: boolean | null
  currentTime: number | null
  duration: number | null
  elementVolume: number | null
  readyState: number | null
  networkState: number | null
  mediaError: string | null
  lastPlayError: string | null
  contextState: AudioContextState | 'unavailable'
  soundFiles: string[]
}

export function musicDebug(): MusicDebug {
  const el = musicEl
  const mediaError = el?.error
    ? `code ${el.error.code}${el.error.message ? ` (${el.error.message})` : ''}`
    : null
  return {
    musicEnabled: isMusicEnabled(),
    volumeSetting: getMusicVolume(),
    wanted: wantedMusic,
    hasElement: el !== null,
    src: el ? el.currentSrc || el.src : null,
    paused: el ? el.paused : null,
    currentTime: el ? Number(el.currentTime.toFixed(2)) : null,
    duration:
      el && Number.isFinite(el.duration) ? Number(el.duration.toFixed(1)) : null,
    elementVolume: el ? Number(el.volume.toFixed(3)) : null,
    readyState: el ? el.readyState : null,
    networkState: el ? el.networkState : null,
    mediaError,
    lastPlayError,
    contextState: context ? context.state : 'unavailable',
    soundFiles: [...KEY_TO_URL.keys()].sort(),
  }
}

/** The panel's ▶ button: a real gesture, so it bypasses the autoplay policy. */
export function retryMusicPlay(): void {
  lastPlayError = null
  if (!wantedMusic) wantedMusic = DEFAULT_MUSIC_NAME
  void applyMusicState()
}
