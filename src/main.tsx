import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { auth, db, functions } from './firebase';
import { getDevTelegramId, shouldUseEmulators } from './devAuth';
import { getInitData, getTelegramUser, initTelegramWebApp, isTelegramEnvironment } from './telegram';

initTelegramWebApp();

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

console.log('Firebase initialized:', auth, db, functions);