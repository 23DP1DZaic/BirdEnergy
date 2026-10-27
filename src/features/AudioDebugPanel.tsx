// AUDIO DEBUG — a temporary on-screen panel for the music channel.
//
// A phone inside Telegram has no console, and "no music" has three completely
// different causes (the switch is off, play() was refused, the media failed to
// load), so this panel shows the live element state and the last play() error.
// It also has a ▶ button: pressing it is a real user gesture, so a track that
// starts from there but not on its own points straight at the autoplay policy.
//
// Remove this component (and its <AudioDebugPanel /> in App.tsx) once the
// music is confirmed working.
import { useEffect, useState } from 'react'
import { musicDebug, retryMusicPlay, type MusicDebug } from './audio'

function yesNo(value: boolean | null): string {
  return value === null ? '—' : value ? 'yes' : 'no'
}

export function AudioDebugPanel() {
  const [state, setState] = useState<MusicDebug>(musicDebug)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const id = window.setInterval(() => setState(musicDebug()), 500)
    return () => window.clearInterval(id)
  }, [])

  const rows: [string, string][] = [
    ['music switch', state.musicEnabled ? 'on' : 'OFF'],
    ['volume slider', String(state.volumeSetting)],
    ['wanted track', state.wanted ?? 'none'],
    ['element', state.hasElement ? 'created' : 'not created'],
    ['paused', yesNo(state.paused)],
    ['position', state.currentTime === null ? '—' : `${state.currentTime}s / ${state.duration ?? '?'}s`],
    ['element volume', state.elementVolume === null ? '—' : String(state.elementVolume)],
    ['readyState', state.readyState === null ? '—' : String(state.readyState)],
    ['networkState', state.networkState === null ? '—' : String(state.networkState)],
    ['media error', state.mediaError ?? 'none'],
    ['last play() error', state.lastPlayError ?? 'none'],
    ['audioctx', state.contextState],
    ['sfx files', state.soundFiles.filter((f) => f.startsWith('sfx/')).join(', ') || 'none'],
    ['music files', state.soundFiles.filter((f) => f.startsWith('music/')).join(', ') || 'none'],
  ]

  return (
    <div className="audio-debug">
      <div className="audio-debug-title">
        <button type="button" onClick={() => setOpen((v) => !v)}>
          {open ? '▾' : '▸'}
        </button>
        <span>AUDIO DEBUG</span>
      </div>
      {open && (
        <>
          {rows.map(([label, value]) => (
            <div className="audio-debug-row" key={label}>
              <span>{label}</span>
              <span>{value}</span>
            </div>
          ))}
          {state.src && (
            <div className="audio-debug-row">
              <span>src</span>
              <span>{state.src.split('/').pop()}</span>
            </div>
          )}
          <div className="audio-debug-actions">
            <button type="button" onClick={retryMusicPlay}>
              ▶ play music
            </button>
          </div>
        </>
      )}
    </div>
  )
}
