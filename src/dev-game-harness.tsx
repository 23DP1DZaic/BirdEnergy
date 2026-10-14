// TEMPORARY — freeze re-check harness, deleted right after use.
import { createRoot } from 'react-dom/client'
import { GameCanvas } from './features/game/GameCanvas'

createRoot(document.getElementById('root')!).render(
  <GameCanvas onPhaseChange={(p) => console.log('[phase]', p)} />,
)
