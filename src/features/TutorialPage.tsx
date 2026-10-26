// UI-02 (Home → Settings → Info) — "How to play": the tutorial screen.
//
// Deliberately tiny: the two sentences a new player needs, and a square slot
// for the tutorial GIF that is still being made. When the animation exists,
// drop the file in src/assets/Tutorial/ and replace the placeholder div with
// <img className="tutorial-media" src={tutorialGif} alt="" /> — the box is
// already square (aspect-ratio 1/1), so nothing else has to change.
//
import { useT } from '../i18n'
import tutorialGif from '../assets/Tutorial/howtoplay.gif'

// Not part of the bottom nav: it is a sub-page of Home, reached from the
// settings menu's Info button (see navigation.ts / App.tsx).
export function TutorialPage() {
  const { t } = useT()
  
  return (
    <div className="tutorial-screen">
      <h2 className="tutorial-title">
        {t('tutorial.title')}
      </h2>

      <p className="tutorial-text">
        {t('tutorial.text')}
      </p>

      <img 
        className="tutorial-media"
        src={tutorialGif}
        alt="BirdEnergy gameplay tutorial showing how to avoid pipes"
      />
    </div>
  )
}
