// UI-02 — Admin Panel placeholder (arrives with CH-03/ADM-01/ADM-02).
// The route itself is already guarded: App renders this only for admins.
import { PlaceholderPage } from './PlaceholderPage'

export function AdminPage() {
  return (
    <PlaceholderPage card="ADM-01">
      <p className="placeholder-hint">
        Challenge CRUD with form validation and delete confirmation will live
        here.
      </p>
    </PlaceholderPage>
  )
}
