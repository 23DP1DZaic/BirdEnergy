// UI-02 — Profile screen placeholder (arrives with UI-04).
import { PlaceholderPage } from './PlaceholderPage'

export function ProfilePage({ signedInUid }: { signedInUid: string | null }) {
  if (!signedInUid) {
    return (
      <PlaceholderPage card="UI-04">
        <p className="guard-text">
          Your profile appears after signing in via Telegram.
        </p>
      </PlaceholderPage>
    )
  }
  return (
    <PlaceholderPage card="UI-04">
      <p className="placeholder-hint">
        Username, role, best score and totals will live here (uid {signedInUid}).
      </p>
    </PlaceholderPage>
  )
}
