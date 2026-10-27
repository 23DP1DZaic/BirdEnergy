import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'

// Set in this module before first render; awaited by the canvas renderer so
// the pixel font is loaded before the first canvas text is drawn.
declare global {
  interface Window {
    __pixelFontReady?: Promise<void>
  }
}
import { auth, db, functions } from './firebase';
import { getDevTelegramId, shouldUseEmulators } from './devAuth';
import { getInitData, getTelegramUser, initTelegramWebApp, isTelegramEnvironment } from './telegram';

initTelegramWebApp();

// i18n — the app opens in Latvian by default (see i18n.ts); the player's own
// choice in the settings menu is remembered per device.

// Press Start 2P — kick off the load before first render and block the first
// canvas frame on it (see GameCanvas). The DOM swaps via font-display: swap;
// only canvas text needs the explicit wait (it doesn't re-render on load).
window.__pixelFontReady = Promise.race([
  document.fonts.load('16px "Press Start 2P"'),
  new Promise<void>((resolve) => setTimeout(resolve, 1500)),
]).then(() => undefined);

// AUTH-01 verification: confirm initData is available in the frontend.
if (isTelegramEnvironment()) {
  const user = getTelegramUser();
  console.log(
    '[AUTH-01] Telegram WebApp detected:',
    user ? `${user.first_name} (id: ${user.id})` : 'no user in initDataUnsafe',
    '| initData present:', getInitData().length > 0,
  );
} else if (getDevTelegramId() !== null) {
  console.log(
    '[AUTH-01] Not inside Telegram — DEV login enabled for Telegram id',
    getDevTelegramId(),
    '| emulators:', shouldUseEmulators(),
  );
} else {
  console.log(
    '[AUTH-01] Not running inside Telegram (normal browser). initData unavailable.',
    'Set VITE_TELEGRAM_ID in .env to sign in locally.',
  );
}

// The boundary wraps everything: a crash in any screen shows a reload screen
// instead of blanking the Mini App (see ErrorBoundary.tsx).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

console.log('Firebase initialized:', auth, db, functions);