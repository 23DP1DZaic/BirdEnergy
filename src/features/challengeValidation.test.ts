/**
 * KĻŪDU TESTS — negative-path tests for the admin challenge form (CH-03).
 *
 * The happy path is exercised by the ADM-01 server tests; this file covers
 * what must happen when the input is WRONG: every rule in
 * challengeValidation.ts is driven from a bad value, and the assertions check
 * the error KEY and its params (not the wording), so the tests survive
 * rewording and language switches.
 *
 * It also guards the error messages themselves: a validation key that has no
 * translation in en/lv/ru, or whose {params} are not substituted, would show
 * the admin a raw key like "validate.min" instead of a sentence — a real
 * defect that only shows up on the error path.
 *
 *   npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CHALLENGE_DESCRIPTION_MAX,
  CHALLENGE_DESCRIPTION_MIN,
  CHALLENGE_TARGET_MAX,
  CHALLENGE_TITLE_MAX,
  CHALLENGE_TITLE_MIN,
  EMPTY_CHALLENGE_FORM,
  firstInvalidField,
  formValuesFromChallenge,
  parseDateInput,
  toChallengeInput,
  validateChallengeForm,
  type ChallengeFormValues,
} from './challengeValidation.ts'
import { LOCALES, setLocale, t } from '../i18n.ts'
import type { Challenge } from './challenges.ts'

/** A payload that passes every rule — each case breaks exactly one field. */
const VALID: ChallengeFormValues = {
  title: 'Spring Sprint',
  description: 'Score as high as you can during the spring event.',
  type: 'single_game_score',
  targetValue: '100',
  startDate: '2026-03-01',
  endDate: '2026-03-10',
}

const withField = (patch: Partial<ChallengeFormValues>): ChallengeFormValues => ({
  ...VALID,
  ...patch,
})

describe('CH-03 — kļūdas obligātajos laukos', () => {
  it('tukšs pieprasījums atgriež kļūdu katrā laukā un fokusē nosaukumu', () => {
    const errors = validateChallengeForm(EMPTY_CHALLENGE_FORM)
    assert.deepEqual(Object.keys(errors).sort(), [
      'description',
      'endDate',
      'startDate',
      'targetValue',
      'title',
      'type',
    ])
    assert.equal(firstInvalidField(errors), 'title')
  })

  it('nosaukums no atstarpēm skaitās tukšs', () => {
    const errors = validateChallengeForm(withField({ title: '   ' }))
    assert.deepEqual(errors.title, { key: 'validate.titleRequired' })
  })

  it(`nosaukums īsāks par ${CHALLENGE_TITLE_MIN} rakstzīmēm tiek noraidīts`, () => {
    const errors = validateChallengeForm(withField({ title: 'ab' }))
    assert.deepEqual(errors.title, {
      key: 'validate.min',
      params: { min: CHALLENGE_TITLE_MIN, count: 2 },
    })
  })

  it(`nosaukums garāks par ${CHALLENGE_TITLE_MAX} rakstzīmēm tiek noraidīts`, () => {
    const errors = validateChallengeForm(
      withField({ title: 'x'.repeat(CHALLENGE_TITLE_MAX + 1) }),
    )
    assert.deepEqual(errors.title, {
      key: 'validate.max',
      params: { max: CHALLENGE_TITLE_MAX, count: CHALLENGE_TITLE_MAX + 1 },
    })
  })

  it('nosaukums ar atstarpēm ap malām tiek apgriezts, nevis noraidīts', () => {
    const errors = validateChallengeForm(withField({ title: '  Spring  ' }))
    assert.equal(errors.title, undefined)
  })

  it(`apraksts īsāks par ${CHALLENGE_DESCRIPTION_MIN} rakstzīmēm tiek noraidīts`, () => {
    const errors = validateChallengeForm(withField({ description: 'short' }))
    assert.deepEqual(errors.description, {
      key: 'validate.min',
      params: { min: CHALLENGE_DESCRIPTION_MIN, count: 5 },
    })
  })

  it(`apraksts garāks par ${CHALLENGE_DESCRIPTION_MAX} rakstzīmēm tiek noraidīts`, () => {
    const errors = validateChallengeForm(
      withField({ description: 'y'.repeat(CHALLENGE_DESCRIPTION_MAX + 1) }),
    )
    assert.deepEqual(errors.description, {
      key: 'validate.max',
      params: {
        max: CHALLENGE_DESCRIPTION_MAX,
        count: CHALLENGE_DESCRIPTION_MAX + 1,
      },
    })
  })

  it('neizvēlēts izaicinājuma veids tiek noraidīts', () => {
    assert.deepEqual(validateChallengeForm(withField({ type: '' })).type, {
      key: 'validate.type',
    })
    assert.deepEqual(
      validateChallengeForm(
        withField({ type: 'bogus' as ChallengeFormValues['type'] }),
      ).type,
      { key: 'validate.type' },
    )
  })

  it('tukšs mērķis tiek noraidīts', () => {
    assert.deepEqual(validateChallengeForm(withField({ targetValue: ' ' })).targetValue, {
      key: 'validate.targetRequired',
    })
  })

  it('mērķis, kas nav skaitlis, tiek noraidīts', () => {
    for (const bad of ['abc', '12abc', 'NaN', 'Infinity']) {
      const errors = validateChallengeForm(withField({ targetValue: bad }))
      assert.equal(errors.targetValue?.key, 'validate.number', `input: ${bad}`)
    }
  })

  it('daļskaitlis tiek noraidīts', () => {
    for (const bad of ['1.5', '0.1', '-2.5']) {
      const errors = validateChallengeForm(withField({ targetValue: bad }))
      const key = errors.targetValue?.key
      assert.ok(
        key === 'validate.whole' || key === 'validate.positive',
        `input ${bad} → ${String(key)}`,
      )
    }
    assert.equal(
      validateChallengeForm(withField({ targetValue: '1.5' })).targetValue?.key,
      'validate.whole',
    )
  })

  it('nulle un negatīvs mērķis tiek noraidīts', () => {
    for (const bad of ['0', '-1', '-1000']) {
      const errors = validateChallengeForm(withField({ targetValue: bad }))
      assert.equal(errors.targetValue?.key, 'validate.positive', `input: ${bad}`)
    }
  })

  it(`mērķis virs ${CHALLENGE_TARGET_MAX} tiek noraidīts, robeža pati par sevi — nē`, () => {
    const tooBig = validateChallengeForm(withField({ targetValue: '1000001' }))
    assert.equal(tooBig.targetValue?.key, 'validate.maxTarget')
    const atLimit = validateChallengeForm(
      withField({ targetValue: String(CHALLENGE_TARGET_MAX) }),
    )
    assert.equal(atLimit.targetValue, undefined)
  })

  it('tukšs sākuma datums tiek noraidīts', () => {
    assert.deepEqual(validateChallengeForm(withField({ startDate: '' })).startDate, {
      key: 'validate.startRequired',
    })
  })

  it('neeksistējošs sākuma datums tiek noraidīts', () => {
    for (const bad of ['2026-02-31', '2026-13-01', '2026-00-10', '01.03.2026']) {
      const errors = validateChallengeForm(withField({ startDate: bad }))
      assert.equal(errors.startDate?.key, 'validate.startInvalid', `input: ${bad}`)
    }
  })

  it('beigu datums agrāk par sākuma datumu tiek noraidīts', () => {
    const errors = validateChallengeForm(
      withField({ startDate: '2026-03-10', endDate: '2026-03-09' }),
    )
    assert.deepEqual(errors.endDate, { key: 'validate.endOrder' })
  })

  it('viens un tas pats sākuma un beigu datums ir derīgs', () => {
    const errors = validateChallengeForm(
      withField({ startDate: '2026-03-10', endDate: '2026-03-10' }),
    )
    assert.deepEqual(errors, {})
  })

  it('kļūda tiek pieteikta tikai konkrētajā laukā', () => {
    const errors = validateChallengeForm(withField({ targetValue: '0' }))
    assert.deepEqual(Object.keys(errors), ['targetValue'])
    assert.equal(firstInvalidField(errors), 'targetValue')
  })
})

describe('CH-03 — datumu parsēšana uz kļūdainas ievades', () => {
  it('29. februāris garajā gadā ir derīgs, īsajā — nē', () => {
    assert.ok(parseDateInput('2024-02-29'))
    assert.equal(parseDateInput('2026-02-29'), null)
  })

  it('Date.UTC pārritināšana netiek pieņemta (31.02 → 3. marts)', () => {
    assert.equal(parseDateInput('2026-02-31'), null)
    assert.equal(parseDateInput('2026-04-31'), null)
  })

  it('formāts bez nullēm un ar liekām atstarpēm', () => {
    assert.equal(parseDateInput('2026-3-1'), null)
    assert.ok(parseDateInput(' 2026-03-01 '))
    assert.equal(parseDateInput(''), null)
    assert.equal(parseDateInput('2026-03'), null)
  })
})

describe('CH-03 — no validētiem laukiem uz payload', () => {
  it('ar kļūdu kaut vienā laukā payload netiek veidots', () => {
    for (const patch of [
      { title: 'x' },
      { description: 'short' },
      { type: 'bogus' as ChallengeFormValues['type'] },
      { targetValue: '0' },
      { startDate: '2026-02-31' },
      { endDate: '2026-01-01' },
    ]) {
      assert.equal(toChallengeInput(withField(patch)), null, JSON.stringify(patch))
    }
  })

  it('derīgs payload: beigu datums aizpilda visu dienu (23:59:59.999)', () => {
    const payload = toChallengeInput(VALID)
    assert.ok(payload)
    assert.equal(payload.title, 'Spring Sprint')
    assert.equal(payload.targetValue, 100)
    assert.equal(payload.startDate.getHours(), 0)
    assert.equal(payload.endDate.getHours(), 23)
    assert.equal(payload.endDate.getMinutes(), 59)
    assert.equal(payload.endDate.getSeconds(), 59)
    assert.equal(payload.endDate.getMilliseconds(), 999)
  })

  it('rediģēšanas režīms atgriež tos pašus laukus (round-trip)', () => {
    const payload = toChallengeInput(VALID)
    assert.ok(payload)
    const challenge = {
      id: 'ch-1',
      ...payload,
    } as Challenge
    assert.deepEqual(formValuesFromChallenge(challenge), {
      title: VALID.title,
      description: VALID.description,
      type: VALID.type,
      targetValue: VALID.targetValue,
      startDate: VALID.startDate,
      endDate: VALID.endDate,
    })
  })
})

describe('I18N — kļūdu ziņojumi ir tulkoti visās valodās', () => {
  /** Every key the rules above can emit. */
  const ERROR_KEYS: Array<[string, Record<string, string | number>?]> = [
    ['validate.titleRequired'],
    ['validate.descRequired'],
    ['validate.targetRequired'],
    ['validate.min', { min: 3, count: 1 }],
    ['validate.max', { max: 80, count: 99 }],
    ['validate.number'],
    ['validate.whole'],
    ['validate.positive'],
    ['validate.maxTarget', { max: '1 000 000' }],
    ['validate.type'],
    ['validate.startRequired'],
    ['validate.startInvalid'],
    ['validate.endRequired'],
    ['validate.endInvalid'],
    ['validate.endOrder'],
  ]

  it('neviens ziņojums neatgriež atslēgu vai neaizvietotu {parametru}', () => {
    const original = LOCALES[0]
    try {
      for (const locale of LOCALES) {
        setLocale(locale)
        for (const [key, params] of ERROR_KEYS) {
          const message = t(key, params)
          assert.notEqual(message, key, `${locale}: ${key} netulkots`)
          assert.ok(
            !/\{[a-z]+\}/i.test(message),
            `${locale}: ${key} satur neaizvietotu parametru → ${message}`,
          )
          assert.ok(message.trim().length > 0, `${locale}: ${key} tukšs`)
        }
      }
    } finally {
      setLocale(original)
    }
  })

  it('formas kļūdas ziņojums atšķiras no citas valodas ziņojuma', () => {
    // A copy-pasted English string in LV/RU is a silent translation defect.
    const messages = new Set<string>()
    const original = LOCALES[0]
    try {
      for (const locale of LOCALES) {
        setLocale(locale)
        messages.add(t('validate.endOrder'))
      }
    } finally {
      setLocale(original)
    }
    assert.equal(messages.size, LOCALES.length)
  })
})
