// UI-02 (Home → Settings → Info) — "How to play": the tutorial screen.
//
// Deliberately tiny: the two sentences a new player needs, and a square slot
// for the tutorial GIF that is still being made. When the animation exists,
// drop the file in src/assets/Tutorial/ and replace the placeholder div with
// <img className="tutorial-media" src={tutorialGif} alt="" /> — the box is
// already square (aspect-ratio 1/1), so nothing else has to change.
//
// Not part of the bottom nav: it is a sub-page of Home, reached from the
// settings menu's Info button (see navigation.ts / App.tsx).
export function TutorialPage() {
  return (
    <div className="tutorial-screen">
      <h2 className="tutorial-title">How to play</h2>
      <p className="tutorial-text">Tap to jump. Don&rsquo;t touch the obstacles.</p>

      {/* Square placeholder for the tutorial GIF (kept 1:1 so the real asset
          drops straight in). */}
      <div className="tutorial-media">
        <span className="tutorial-media-note">Tutorial GIF</span>
      </div>
    </div>
  )
}
