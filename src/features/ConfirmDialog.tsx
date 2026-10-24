// ADM-02 — the confirmation dialog that stands in front of an irreversible
// call (currently challenge deletion).
//
// Spec: "Dzēšanai frontendam pirms funkcijas izsaukšanas jāparāda apstiprinājuma
// modālais logs. Backends nedrīkst paļauties uz šo logu autorizācijai." — so
// this dialog is UX, and the function keeps its own authorisation checks.
//
// Behaviour:
//   * Cancel is reachable three ways — the button, Escape and a tap outside —
//     and each of them only ever cancels; nothing is called.
//   * Focus starts on Cancel (the safe choice); the caller may move it back to
//     the triggering button when the dialog closes.
//   * While the call is in flight the dialog cannot be dismissed, so the result
//     is never reported to a dialog that already closed.
//   * A backend failure keeps the dialog open and shows the reason in it
//     (spec's kļūdu uzvedība), leaving the decision with the admin.
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { PixelIcon } from './ui/PixelIcon'
import type { IconName } from './ui/pixelIcons'

interface ConfirmDialogProps {
  /** Dialog heading — phrased as the question being confirmed. */
  title: string
  /** Body copy: what confirming actually does. */
  message: ReactNode
  /** Label of the confirming button (e.g. "Delete" or "Buy"). */
  confirmLabel: string
  /** Same button while the request runs (e.g. "Deleting…"). */
  busyLabel: string
  /** Icon in the confirm button; defaults to the destructive trash. */
  confirmIcon?: IconName
  /** Confirm styling: 'danger' red (default) or 'primary' gold for a buy. */
  confirmTone?: 'danger' | 'primary'
  /** Cancel label; defaults to the built-in English "Cancel". */
  cancelLabel?: string
  /** True while the confirmed call is in flight. */
  busy: boolean
  /** Backend failure to show inside the dialog; null when there is none. */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busyLabel,
  confirmIcon = 'trash',
  confirmTone = 'danger',
  cancelLabel = 'Cancel',
  busy,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const messageId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // The dialog opens with focus on the harmless button, not the destructive one.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Escape cancels — never while busy, so an in-flight delete cannot lose its
  // place to report success or failure.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return
      event.preventDefault()
      onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  return (
    <div
      className="modal-backdrop"
      // Tap outside cancels. Mouse-down (not click) so a drag that starts
      // inside the dialog and ends on the backdrop is not read as a cancel.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <h2 className="modal-title" id={titleId}>
          {title}
        </h2>
        <p className="modal-text" id={messageId}>
          {message}
        </p>
        {error && (
          <p className="form-error form-error-general" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-small"
            disabled={busy}
            onClick={onCancel}
          >
            <PixelIcon name="close" size={18} />
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-small${
              confirmTone === 'danger' ? ' btn-danger' : ''
            }`}
            disabled={busy}
            onClick={onConfirm}
          >
            <PixelIcon name={confirmIcon} size={18} />
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
