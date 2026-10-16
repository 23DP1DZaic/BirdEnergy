// UI — top-level error boundary.
//
// React unmounts the WHOLE tree when a render or lifecycle error is thrown and
// nothing catches it. In a Telegram Mini App that means a blank screen with no
// way back except closing and reopening it, so this boundary turns a crash
// into an actionable screen instead.
//
// Scope: render/lifecycle errors only, by design. Async failures (a rejected
// fetch, a failed Cloud Function) are handled where they happen — the Game
// page already queues a run it cannot save, for instance — and deliberately
// do NOT bring the app down.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from './i18n'
import './App.css'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {error: null}

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {error}
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only: the fallback below is the user-facing report, and a crash
    // reporter would just be one more thing that can itself fail.
    console.error('Bird Energy crashed', error, info.componentStack ?? '')
  }

  render(): ReactNode {
    const {error} = this.state
    if (error === null) return this.props.children

    return (
      <main className="page">
        <div className="content">
          <div className="consent">
            <h1 className="consent-title">{t('error.title')}</h1>
            <p className="consent-text">{t('error.text')}</p>
            <p className="consent-text consent-fineprint">{error.message}</p>
            <div className="consent-actions">
              {/* A full reload also resets the engine's in-memory state. */}
              <button
                type="button"
                className="btn"
                onClick={() => window.location.reload()}
              >
                {t('error.reload')}
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }
}
