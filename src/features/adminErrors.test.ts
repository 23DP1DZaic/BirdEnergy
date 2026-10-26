/**
 * KĻŪDU TESTS — ADM-01 / ADM-02 error messages.
 *
 * describeMutationError decides what the admin reads when a create/update/
 * delete fails. A wrong mapping is not a crash: it silently tells the admin
 * "something went wrong" (or worse, that the change failed when it did not),
 * which is why every failure mode the callable can produce is pinned here.
 *
 * The messages are English on purpose (the admin panel is not translated),
 * so the assertions match on stable fragments, not whole sentences.
 *
 *   npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeMutationError } from './adminErrors.ts'

/** The shape firebase/functions rejects with (a FirebaseError is an Error). */
function callableError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

describe('ADM-01 — kļūdas kods → saprotams ziņojums', () => {
  it('permission-denied: paskaidro, ka mainīt drīkst tikai administrators', () => {
    const message = describeMutationError(
      callableError('functions/permission-denied', 'Admin only. [403]'),
    )
    assert.match(message, /Only administrators/)
    assert.match(message, /Admin only\./)
    assert.ok(!message.includes('[403]'), 'HTTP statusa numurs netiek rādīts')
  })

  it('unauthenticated: lūdz pierakstīties vēlreiz', () => {
    const message = describeMutationError(
      callableError('functions/unauthenticated', 'Unauthenticated. [401]'),
    )
    assert.match(message, /Sign in again/)
  })

  it('not-found: paskaidro, ka izaicinājums vairs neeksistē', () => {
    const message = describeMutationError(
      callableError('functions/not-found', 'Challenge not found. [404]'),
    )
    assert.match(message, /no longer exists/)
    assert.ok(!message.includes('[404]'))
  })

  it('unavailable: ziņo par nepieejamu servisu un ka nekas netika mainīts', () => {
    const message = describeMutationError(
      callableError('functions/unavailable', 'Service unavailable. [503]'),
    )
    assert.match(message, /unreachable/)
    assert.match(message, /nothing was changed/)
  })

  it('invalid-argument: rāda servera tekstu bez statusa numura', () => {
    const message = describeMutationError(
      callableError(
        'functions/invalid-argument',
        'Title must be 3-80 characters. [400]',
      ),
    )
    assert.equal(message, 'Title must be 3-80 characters.')
  })

  it('neizvietota funkcija (unimplemented) neatstāj iespaidu, ka izmaiņas saglabātas', () => {
    const message = describeMutationError(
      callableError('functions/unimplemented', 'Function not deployed.'),
    )
    assert.match(message, /could not be reached/)
    assert.match(message, /nothing was changed/)
  })

  it('tukšs maršruts (NOT_FOUND) tiek atpazīts kā nesasniedzama funkcija', () => {
    const message = describeMutationError(
      callableError('functions/not-found', 'NOT_FOUND'),
    )
    assert.match(message, /could not be reached/)
  })

  it('emulatora preflight (internal [N]) tiek atpazīts kā nesasniedzama funkcija', () => {
    const message = describeMutationError(
      callableError('functions/internal', 'internal [500]'),
    )
    assert.match(message, /could not be reached/)
  })

  it('cita internal kļūda paliek vispārīga, bet godīga', () => {
    const message = describeMutationError(
      callableError('functions/internal', 'Database write failed. [500]'),
    )
    assert.equal(message, 'Database write failed.')
  })

  it('nezināms kods ar tekstu: teksts tiek parādīts', () => {
    assert.equal(
      describeMutationError(callableError('functions/whatever', 'Boom. [500]')),
      'Boom.',
    )
  })

  it('kļūda bez teksta un bez koda nedod tukšu ziņojumu', () => {
    assert.match(
      describeMutationError(callableError('functions/internal', '')),
      /Something went wrong/,
    )
  })

  it('virkne, null un undefined netiek uzskatīti par kļūdu ar kodu', () => {
    assert.equal(describeMutationError('Bad input'), 'Bad input')
    assert.match(String(describeMutationError(null)), /Something went wrong/)
    assert.match(String(describeMutationError(undefined)), /Something went wrong/)
  })
})
