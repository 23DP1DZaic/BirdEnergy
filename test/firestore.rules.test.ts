/**
 * SEC-01 — Firestore security-rules tests.
 *
 * Runs the REAL rules from ./firestore.rules against the Firestore emulator and
 * drives them through the three client states the DoD names:
 *
 *   guest  — no Firebase session at all
 *   player — signed in, `role: 'user'`  (authenticateTelegram's custom claim)
 *   admin  — signed in, `role: 'admin'` (same claim, admin value)
 *
 * The invariant under test: users/, gameResults/ and challenges/ accept NO
 * direct client writes — not from a guest, not from the document's own owner,
 * and not from an admin. Every write goes through a Cloud Function using the
 * Admin SDK, which bypasses these rules by design. Reads stay open only where
 * the app actually needs them: your own users/{uid}, the challenges list, and
 * your own runs in gameResults.
 *
 * Run with `npm run test:rules` — the script starts and stops the emulator
 * around this file (`firebase emulators:exec --only firestore`), so nothing
 * here manages a process.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

/** Must match .firebaserc and the emulator ports in firebase.json. */
const PROJECT_ID = 'birdenergy-f1405'
const FIRESTORE_EMULATOR = {host: '127.0.0.1', port: 8080}

/** The rules under test, read from the file Firebase actually deploys. */
const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

const ME = 'tg-1001'
const OTHER = 'tg-1002'
const ADMIN = 'tg-9001'
const CHALLENGE_ID = 'ch-1'
const MY_RESULT = `${ME}-run-1`
const OTHER_RESULT = `${OTHER}-run-1`

let testEnv: RulesTestEnvironment

/** A signed-in client; `role` mirrors authenticateTelegram's custom claim. */
function asPlayer(uid: string, role: 'user' | 'admin'): RulesTestContext {
  return testEnv.authenticatedContext(uid, {role})
}

const guest = () => testEnv.unauthenticatedContext()
const user = () => asPlayer(ME, 'user')
const admin = () => asPlayer(ADMIN, 'admin')

/** A profile doc as authenticateTelegram writes it (Admin SDK, rules bypassed). */
function profile(uid: string, telegramId: number, inGameName: string) {
  return {
    uid,
    telegramId,
    inGameName,
    role: 'user',
    bestScore: 42,
    totalGames: 3,
    totalScore: 80,
    acceptedDataProcessingAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

/** A run doc as submitGameResult writes it (Admin SDK, rules bypassed). */
function run(uid: string, score: number) {
  return {
    uid,
    score,
    durationMs: 30_000,
    jumpCount: 17,
    createdAt: new Date('2026-01-02T00:00:00Z'),
  }
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {...FIRESTORE_EMULATOR, rules: RULES},
  })
})

after(async () => {
  await testEnv.cleanup()
})

// Every test starts from the same fixture, written with the rules bypassed so
// the data exists regardless of what the rules allow.
beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', ME), profile(ME, 1001, 'Player One'))
    await setDoc(doc(db, 'users', OTHER), profile(OTHER, 1002, 'Player Two'))
    await setDoc(doc(db, 'users', ADMIN), profile(ADMIN, 9001, 'The Admin'))
    await setDoc(doc(db, 'challenges', CHALLENGE_ID), {
      title: 'Score 100 in one run',
      description: 'A single run worth 100 points or more.',
      type: 'single_game_score',
      targetValue: 100,
      startDate: '2026-01-01',
      endDate: '2026-02-01',
    })
    await setDoc(doc(db, 'gameResults', MY_RESULT), run(ME, 42))
    await setDoc(doc(db, 'gameResults', OTHER_RESULT), run(OTHER, 7))
  })
})

describe('guest — no session', () => {
  it('cannot read any profile, not even by its exact id', async () => {
    const db = guest().firestore()
    await assertFails(getDoc(doc(db, 'users', ME)))
  })

  it('cannot list the challenge list', async () => {
    const db = guest().firestore()
    await assertFails(getDocs(collection(db, 'challenges')))
  })

  it('cannot read a challenge by id', async () => {
    const db = guest().firestore()
    await assertFails(getDoc(doc(db, 'challenges', CHALLENGE_ID)))
  })

  it('cannot read or query gameResults', async () => {
    const db = guest().firestore()
    await assertFails(getDocs(collection(db, 'gameResults')))
    await assertFails(
      getDocs(query(collection(db, 'gameResults'), where('uid', '==', ME))),
    )
  })

  it('cannot write to any protected collection', async () => {
    const db = guest().firestore()
    await assertFails(setDoc(doc(db, 'users', ME), profile(ME, 1001, 'Fake')))
    await assertFails(setDoc(doc(db, 'gameResults', 'guest-run'), run(ME, 999)))
    await assertFails(setDoc(doc(db, 'challenges', 'ch-fake'), {title: 'x'}))
  })
})

describe('player — signed in as a normal user', () => {
  it('reads their own profile', async () => {
    const db = user().firestore()
    const snap = await assertSucceeds(getDoc(doc(db, 'users', ME)))
    assert.equal(snap.data()?.inGameName, 'Player One')
  })

  it('cannot read another player profile', async () => {
    const db = user().firestore()
    await assertFails(getDoc(doc(db, 'users', OTHER)))
  })

  it('cannot list profiles (no client-side leaderboard scan)', async () => {
    const db = user().firestore()
    await assertFails(getDocs(collection(db, 'users')))
  })

  it('cannot write their own profile — not even to change one field', async () => {
    const db = user().firestore()
    assert.equal((await getDoc(doc(db, 'users', ME))).exists(), true)

    await assertFails(setDoc(doc(db, 'users', ME), profile(ME, 1001, 'Renamed')))
    await assertFails(updateDoc(doc(db, 'users', ME), {bestScore: 999_999}))
    await assertFails(deleteDoc(doc(db, 'users', ME)))
    await assertFails(addDoc(collection(db, 'users'), profile('tg-99', 99, 'x')))
    // Privilege escalation attempt: the role lives in the token claim, never in
    // a document the client can touch.
    await assertFails(updateDoc(doc(db, 'users', ME), {role: 'admin'}))
  })

  it('reads the challenge list and a single challenge', async () => {
    const db = user().firestore()
    const list = await assertSucceeds(getDocs(collection(db, 'challenges')))
    assert.equal(list.size, 1)
    await assertSucceeds(getDoc(doc(db, 'challenges', CHALLENGE_ID)))
  })

  it('cannot write challenges', async () => {
    const db = user().firestore()
    await assertFails(
      setDoc(doc(db, 'challenges', 'ch-new'), {
        title: 'Injected',
        description: 'x',
        type: 'games_played',
        targetValue: 1,
        startDate: '2026-01-01',
        endDate: '2026-02-01',
      }),
    )
    await assertFails(updateDoc(doc(db, 'challenges', CHALLENGE_ID), {title: 'x'}))
    await assertFails(deleteDoc(doc(db, 'challenges', CHALLENGE_ID)))
    await assertFails(addDoc(collection(db, 'challenges'), {title: 'x'}))
  })

  it('lists only their own runs, when the query is scoped to their uid', async () => {
    const db = user().firestore()
    const mine = await assertSucceeds(
      getDocs(query(collection(db, 'gameResults'), where('uid', '==', ME))),
    )
    assert.equal(mine.size, 1)
    assert.equal(mine.docs[0].data().score, 42)
  })

  it('cannot read another player runs, or run an unscoped query', async () => {
    const db = user().firestore()
    await assertFails(
      getDocs(query(collection(db, 'gameResults'), where('uid', '==', OTHER))),
    )
    await assertFails(getDocs(collection(db, 'gameResults')))
  })

  it('cannot read a run by id or write any run', async () => {
    const db = user().firestore()
    await assertFails(getDoc(doc(db, 'gameResults', MY_RESULT)))
    await assertFails(deleteDoc(doc(db, 'gameResults', MY_RESULT)))
    await assertFails(updateDoc(doc(db, 'gameResults', MY_RESULT), {score: 9999}))
    // Fabricating a run for another player must fail too.
    await assertFails(
      addDoc(collection(db, 'gameResults'), {uid: OTHER, score: 10_000}),
    )
    await assertFails(setDoc(doc(db, 'gameResults', 'forged'), run(ME, 10_000)))
  })
})

describe('admin — signed in with the admin claim', () => {
  it('reads its own profile and the challenge list, like any signed-in user', async () => {
    const db = admin().firestore()
    assert.equal(
      (await assertSucceeds(getDoc(doc(db, 'users', ADMIN)))).data()?.inGameName,
      'The Admin',
    )
    assert.equal((await assertSucceeds(getDocs(collection(db, 'challenges')))).size, 1)
  })

  it('gets no extra read access: another profile stays private', async () => {
    const db = admin().firestore()
    await assertFails(getDoc(doc(db, 'users', ME)))
    await assertFails(getDocs(collection(db, 'users')))
    await assertFails(
      getDocs(query(collection(db, 'gameResults'), where('uid', '==', ME))),
    )
  })

  it('still cannot write anything from the client', async () => {
    const db = admin().firestore()

    await assertFails(updateDoc(doc(db, 'users', ADMIN), {role: 'admin'}))
    await assertFails(setDoc(doc(db, 'users', OTHER), profile(OTHER, 1002, 'x')))
    await assertFails(deleteDoc(doc(db, 'users', OTHER)))

    await assertFails(
      setDoc(doc(db, 'challenges', 'ch-admin'), {
        title: 'Direct write',
        description: 'x',
        type: 'games_played',
        targetValue: 1,
        startDate: '2026-01-01',
        endDate: '2026-02-01',
      }),
    )
    await assertFails(updateDoc(doc(db, 'challenges', CHALLENGE_ID), {targetValue: 1}))
    await assertFails(deleteDoc(doc(db, 'challenges', CHALLENGE_ID)))

    await assertFails(addDoc(collection(db, 'gameResults'), run(ADMIN, 9001)))
    await assertFails(updateDoc(doc(db, 'gameResults', MY_RESULT), {score: 1}))
    await assertFails(deleteDoc(doc(db, 'gameResults', MY_RESULT)))
  })
})

describe('adversarial queries against the gameResults list rule', () => {
  it('rejects a range query that is not pinned to the caller uid', async () => {
    const db = user().firestore()
    await assertFails(
      getDocs(query(collection(db, 'gameResults'), where('uid', '>=', 'tg-'))),
    )
  })

  it('rejects an `in` query that could also return another player runs', async () => {
    const db = user().firestore()
    await assertFails(
      getDocs(
        query(collection(db, 'gameResults'), where('uid', 'in', [ME, OTHER])),
      ),
    )
  })
})

describe('default deny — anything not named in the rules', () => {
  it('is closed to guests, players and admins alike', async () => {
    for (const ctx of [guest(), user(), admin()]) {
      const db = ctx.firestore()
      await assertFails(getDoc(doc(db, 'secrets', 'a')))
      await assertFails(setDoc(doc(db, 'secrets', 'a'), {x: 1}))
      // A nested path under a readable collection is NOT implicitly readable.
      await assertFails(getDoc(doc(db, 'users', ME, 'private', 'a')))
      await assertFails(setDoc(doc(db, 'users', ME, 'private', 'a'), {x: 1}))
    }
  })
})
