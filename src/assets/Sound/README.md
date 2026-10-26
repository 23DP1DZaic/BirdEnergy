# Audio assets

Drop files here and they work — the game reads them **by name**
(`src/features/audio.ts`), so no code has to change.

```
src/assets/Sound/sfx/flap.mp3      ← every jump
src/assets/Sound/sfx/score.mp3     ← a pipe was passed
src/assets/Sound/sfx/hit.mp3       ← the collision that ends the run
src/assets/Sound/sfx/die.mp3       ← the bird touches down
src/assets/Sound/music/main.mp3    ← the loop under the Game screen
```

* The extension can be anything Vite understands (`mp3`, `ogg`, `wav`, `m4a`).
* Every file is optional — a missing name is a silent no-op.
* The **Music / Sound effects** switches in Home's settings are read live.
* Keep files short and quiet: the game restarts in a second.
