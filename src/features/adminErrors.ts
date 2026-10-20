// ADM-01/ADM-02 — turning a failed admin mutation into a message the admin can
// act on.
//
// Pure and dependency-free on purpose: the mapping is the part of the error
// path that can actually be wrong (a wrong code reads as "something went
// wrong" forever), so it is unit-tested in adminErrors.test.ts instead of only
// being exercised through a live callable.

/**
 * `unknown` because a rejected callable can be a FirebaseError, a plain Error,
 * a string or something else entirely; every branch below reads defensively.
 */
export function describeMutationError(err: unknown): string {
  const code =
    err !== null && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : ''
  // Only a real message is useful; String(null) or String({}) would put
  // "null" / "[object Object]" in front of the admin.
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : ''
  // The callable SDK appends the HTTP status to a server-supplied message
  // ("Challenge not found. [404]"); that number is noise for the admin.
  const detail = raw.replace(/\s*\[\d+\]$/, '').trim()

  // A callable that is not deployed anywhere answers either with the SDK's
  // generic NOT_FOUND (no such route) or, against the emulator, with a failing
  // preflight that surfaces as a bare "internal [N]". Both are checked on the
  // raw message, before the status suffix is stripped.
  const unreachable =
    code === 'functions/unimplemented' ||
    (code === 'functions/not-found' && raw.trim().toUpperCase() === 'NOT_FOUND') ||
    (code === 'functions/internal' && /^internal \[\d+\]$/.test(raw.trim()))
  if (unreachable) {
    return 'The adminChallengeMutation Cloud Function (ADM-01) could not be reached — nothing was changed.'
  }

  switch (code) {
    case 'functions/permission-denied':
      return `Only administrators may change challenges — ${detail}`
    case 'functions/unauthenticated':
      return 'Sign in again as an administrator to change challenges.'
    case 'functions/not-found':
      // ADM-02: the challenge was removed elsewhere (or by an earlier click),
      // so the admin list is simply out of date.
      return 'That challenge no longer exists — it may have been deleted on another device. Reload the list and try again.'
    case 'functions/unavailable':
      return 'The admin service is unreachable right now — nothing was changed. Check your connection and try again.'
    default:
      // invalid-argument messages are already written for a human.
      return detail || 'Something went wrong and nothing was changed.'
  }
}
