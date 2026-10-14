/**
 * scripts/post-gigs/select — which gigs a run posts. Every selection here
 * decides what gets FUNDED on a real chain, so the interesting cases are the
 * ones that must refuse rather than the ones that must match.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { selectGigs, parseOnly, type Selection } from '@server/scripts/post-gigs/select'

const BOOK = [
  { title: 'Pump prices in Surulere' },
  { title: 'Forex rate board in Accra' },
  { title: 'Matatu fare in Nairobi' },
  { title: 'Cooking gas refill per kg' },
  { title: 'Cooking-oil shelf price' },
] as const

const sel = (over: Partial<Selection> = {}): Selection => ({
  skip: 0,
  limit: BOOK.length,
  only: [],
  ...over,
})

test('with no --only it is a positional window', () => {
  assert.deepEqual(selectGigs(BOOK, sel({ skip: 1, limit: 2 })).map((g) => g.title), [
    'Forex rate board in Accra',
    'Matatu fare in Nairobi',
  ])
})

test('--only picks named gigs regardless of position', () => {
  const out = selectGigs(BOOK, sel({ only: ['matatu', 'forex'] }))
  // Book order, NOT the order the tokens were typed — the book is interleaved
  // by country and a partial run must stay diverse.
  assert.deepEqual(out.map((g) => g.title), ['Forex rate board in Accra', 'Matatu fare in Nairobi'])
})

test('--only overrides skip/limit rather than combining with them', () => {
  const out = selectGigs(BOOK, sel({ skip: 4, limit: 1, only: ['forex'] }))
  assert.deepEqual(out.map((g) => g.title), ['Forex rate board in Accra'])
})

test('a token matching nothing is refused, not silently dropped', () => {
  assert.throws(() => selectGigs(BOOK, sel({ only: ['jeepney'] })), /matches no gig/)
})

test('an ambiguous token is refused and names every gig it hit', () => {
  // 'cooking' hits both the gas and the oil gig. Posting spends real money, so
  // guessing between them is not an option.
  assert.throws(
    () => selectGigs(BOOK, sel({ only: ['cooking'] })),
    (err: Error) => /ambiguous/.test(err.message) && /Cooking gas/.test(err.message) && /Cooking-oil/.test(err.message),
  )
})

test('a more specific token disambiguates', () => {
  assert.deepEqual(selectGigs(BOOK, sel({ only: ['cooking-oil'] })).map((g) => g.title), [
    'Cooking-oil shelf price',
  ])
})

test('matching ignores case and surrounding spaces', () => {
  assert.equal(selectGigs(BOOK, sel({ only: ['  MATATU '] })).length, 1)
})

test('every bad token is reported at once, not one run at a time', () => {
  let message = ''
  try {
    selectGigs(BOOK, sel({ only: ['nope', 'alsonope'] }))
  } catch (err) {
    message = err instanceof Error ? err.message : String(err)
  }
  assert.match(message, /nope/)
  assert.match(message, /alsonope/)
})

test('an empty token is refused rather than matching every gig', () => {
  // ''.includes('') is true for every title, so a stray comma would otherwise
  // select the WHOLE book and fund all of it.
  assert.throws(() => selectGigs(BOOK, sel({ only: parseOnly('forex,') })), /empty --only token/)
})

test('the same gig named twice is posted once', () => {
  assert.equal(selectGigs(BOOK, sel({ only: ['matatu', 'Matatu fare'] })).length, 1)
})

test('parseOnly splits a comma list and yields nothing when absent', () => {
  assert.deepEqual(parseOnly('a,b'), ['a', 'b'])
  assert.deepEqual(parseOnly(undefined), [])
})

test('a window that starts past the end is refused, not an empty green run', () => {
  // A resume with nothing left, or a typo in the offset: either must say so.
  assert.throws(() => selectGigs(BOOK, sel({ skip: BOOK.length })), /passes the whole book of 5/)
  assert.equal(selectGigs(BOOK, sel({ skip: BOOK.length - 1 })).length, 1)
  // `--only` is not positional, so the window is not consulted at all.
  assert.equal(selectGigs(BOOK, sel({ skip: BOOK.length, only: ['matatu'] })).length, 1)
})
