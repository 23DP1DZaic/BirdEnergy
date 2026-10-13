// E — the offline queue for finished runs.
//
// submitGameResult can fail for reasons that have nothing to do with the run
// (a flaky mobile connection, a cold function, the tab backgrounded at exactly
// the wrong moment). Losing the score a player just earned is the worst
// possible failure for a game, so every run is:
//
//   1. tagged with a client-generated `runId`, which makes the SERVER ignore a
//      retry — it lands on the same document (see submitGameResult), and
//   2. kept in localStorage when the submit fails, then replayed the next time
//      the app loads or the connection comes back.
//
// Because retries are idempotent, a run that reached the server but whose
// response was lost is simply re-ignored — never counted twice. Runs that
// failed for a reason retrying cannot fix (validation) are dropped instead of
// being kept forever.
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../firebase'
import type { SubmitRunInput, SubmitRunResponse } from './userProfile'

const QUEUE_KEY = 'birdenergy.pendingRuns'
/** Give up after this many attempts — it will never succeed. */
const MAX_ATTEMPTS = 5
/** A long session must not grow the queue without bound (oldest dropped). */
const MAX_RUNS = 50

export interface PendingRun extends SubmitRunInput {
  runId: string
  /** When the run finished (epoch ms) — replayed oldest first. */
  finishedAt: number
  attempts: number
}

/** A per-run id the server uses to ignore retries. */
export function newRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isPendingRun(value: unknown): value is PendingRun {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.runId === 'string' &&
    typeof v.score === 'number' &&
    typeof v.durationMs === 'number' &&
    typeof v.jumpCount === 'number' &&
    typeof v.finishedAt === 'number' &&
    typeof v.attempts === 'number'
  )
}

/** Corrupt or unavailable storage reads as an empty queue, never as a crash. */
function readQueue(): PendingRun[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPendingRun) : []
  } catch {
    return []
  }
}

function writeQueue(queue: PendingRun[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // Storage full or blocked (private mode): the run is lost, the game is not.
  }
}

function enqueue(run: PendingRun): void {
  const queue = readQueue().filter((r) => r.runId !== run.runId)
  queue.push(run)
  writeQueue(queue.slice(-MAX_RUNS))
}

/** How many runs are still waiting for a connection (0 = nothing queued). */
export function pendingRunCount(): number {
  return readQueue().length
}

const submit = httpsCallable<SubmitRunInput, SubmitRunResponse>(
  functions,
  'submitGameResult',
)

/** A retry could never fix these — the run is dropped rather than replayed. */
function isPermanentFailure(err: unknown): boolean {
  if (err === null || typeof err !== 'object' || !('code' in err)) return false
  return String((err as { code: unknown }).code) === 'functions/invalid-argument'
}

let flushing = false

/**
 * DATA-01 — persists one finished run. Never rejects: a failure queues the run
 * for later so the Game Over screen is never blocked. Resolves with the
 * server's aggregates, or null when the run is waiting for a connection.
 */
export async function submitRun(
  run: SubmitRunInput,
): Promise<SubmitRunResponse | null> {
  const pending: PendingRun = {
    ...run,
    runId: run.runId ?? newRunId(),
    finishedAt: Date.now(),
    attempts: 0,
  }
  try {
    const result = await submit(pending)
    // One save usually means the connection is back — drain the backlog now.
    void flushPendingRuns()
    return result.data
  } catch (err) {
    if (isPermanentFailure(err)) {
      console.warn('submitGameResult rejected the run', err)
      return null
    }
    console.warn('submitGameResult failed — run queued', pending.runId, err)
    enqueue(pending)
    return null
  }
}

/**
 * Replays the queued runs, oldest first. Idempotent server-side, so a partial
 * failure is safe: already-saved runs come back unchanged and are dropped from
 * the queue. Returns silently while signed out — attempts must not be burned
 * on calls that cannot authenticate.
 */
export async function flushPendingRuns(): Promise<number> {
  if (flushing || !auth.currentUser) return 0
  flushing = true
  try {
    const queue = readQueue()
    if (queue.length === 0) return 0

    const remaining: PendingRun[] = []
    let saved = 0
    for (const run of queue.sort((a, b) => a.finishedAt - b.finishedAt)) {
      try {
        await submit(run)
        saved += 1
      } catch (err) {
        if (isPermanentFailure(err)) continue
        remaining.push({...run, attempts: run.attempts + 1})
      }
    }
    writeQueue(remaining.filter((r) => r.attempts < MAX_ATTEMPTS))
    return saved
  } finally {
    flushing = false
  }
}

// Replays automatically as soon as there is something to replay with.
let autoFlushInstalled = false
function installAutoFlush(): void {
  if (autoFlushInstalled) return
  autoFlushInstalled = true
  window.addEventListener('online', () => void flushPendingRuns())
  window.addEventListener('pageshow', () => void flushPendingRuns())
}
installAutoFlush()
