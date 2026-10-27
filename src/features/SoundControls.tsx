// AUDIO — the one Music / Sound-effects block, used twice: inside Home's
// settings menu and inside the game's pause menu. Both places render this
// component, so the switches and the loudness sliders behave (and look)
// identical — a change made in the pause menu is already applied on Home and
// vice versa, because the state lives in soundSettings.ts.
//
// Each row is the sprite toggle plus its slider. The slider is disabled while
// its switch is off: a loudness for a channel that is muted has nothing to
// preview.
import { useT } from '../i18n'
import { useSoundSettings } from './soundSettings'
import { PixelIcon } from './ui/PixelIcon'

export function SoundControls() {
  const { t } = useT()
  const {
    music,
    sfx,
    musicVolume,
    sfxVolume,
    toggleMusic,
    toggleSfx,
    setMusicVolume,
    setSfxVolume,
  } = useSoundSettings()

  return (
    <div className="sound-controls">
      <div className="sound-row">
        <button
          type="button"
          className="sound-toggle"
          aria-pressed={music}
          aria-label={t('home.music', {
            state: t(music ? 'state.on' : 'state.off'),
          })}
          title={t('home.music', {
            state: t(music ? 'state.on' : 'state.off'),
          })}
          onClick={toggleMusic}
        >
          <PixelIcon name={music ? 'music' : 'musicOff'} size={28} />
        </button>
        <input
          type="range"
          className="sound-slider"
          min={0}
          max={100}
          step={5}
          value={Math.round(musicVolume * 100)}
          disabled={!music}
          aria-label={t('sound.musicVolume')}
          onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
        />
      </div>
      <div className="sound-row">
        <button
          type="button"
          className="sound-toggle"
          aria-pressed={sfx}
          aria-label={t('home.sfx', {
            state: t(sfx ? 'state.on' : 'state.off'),
          })}
          title={t('home.sfx', {
            state: t(sfx ? 'state.on' : 'state.off'),
          })}
          onClick={toggleSfx}
        >
          <PixelIcon name={sfx ? 'soundOn' : 'soundOff'} size={28} />
        </button>
        <input
          type="range"
          className="sound-slider"
          min={0}
          max={100}
          step={5}
          value={Math.round(sfxVolume * 100)}
          disabled={!sfx}
          aria-label={t('sound.sfxVolume')}
          onChange={(e) => setSfxVolume(Number(e.target.value) / 100)}
        />
      </div>
    </div>
  )
}
