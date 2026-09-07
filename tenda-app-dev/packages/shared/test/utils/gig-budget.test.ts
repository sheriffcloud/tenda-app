import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasGigBudget,
  gigBudgetFromUnits,
  gigBudgetRangeLabel,
  gigBudgetToRaw,
  gigBudgetToText,
  sanitizeGigBudgetText,
} from '../../src/utils/gig-budget'
import { getGigStepMissingRequirement } from '../../src/constants/gig-composer'
import { emptyProofParamsDraft } from '../../src/constants/gig-composer-proofs'
import type { ProofType } from '../../src/constants/proofs'

test('sanitizeGigBudgetText: keeps a plain decimal the asset can represent', () => {
  assert.equal(sanitizeGigBudgetText('12.5', 'USDC_SOL'), '12.5')
  assert.equal(sanitizeGigBudgetText('0.000001', 'USDC_SOL'), '0.000001')
  assert.equal(sanitizeGigBudgetText('1250.75', 'cUSD'), '1250.75')
})

test('sanitizeGigBudgetText: refuses the digit past the asset precision, per asset', () => {
  // The whole point: a 7th decimal on 6dp USDC never enters the field, so what
  // is on screen is what gets escrowed. The SAME text is fine on 18dp cUSD.
  assert.equal(sanitizeGigBudgetText('1.9999999', 'USDC_SOL'), '1.999999')
  assert.equal(sanitizeGigBudgetText('1.9999999', 'cUSD'), '1.9999999')
  assert.equal(sanitizeGigBudgetText('0.1234567890', 'SOL'), '0.123456789') // 9dp
})

test('sanitizeGigBudgetText: strips what is not a number, so raw conversion cannot see it', () => {
  assert.equal(sanitizeGigBudgetText('-5', 'USDC_SOL'), '5')
  assert.equal(sanitizeGigBudgetText('1e6', 'USDC_SOL'), '16')
  assert.equal(sanitizeGigBudgetText('12 USDC', 'USDC_SOL'), '12')
  assert.equal(sanitizeGigBudgetText('abc', 'USDC_SOL'), '')
})

test('sanitizeGigBudgetText: a lone trailing dot survives, or nobody can type a decimal', () => {
  assert.equal(sanitizeGigBudgetText('12.', 'USDC_SOL'), '12.')
  assert.equal(sanitizeGigBudgetText('.', 'USDC_SOL'), '.')
  assert.equal(sanitizeGigBudgetText('.5', 'USDC_SOL'), '.5')
})

test('sanitizeGigBudgetText: a second dot is a typo, and joining beats truncating', () => {
  // '1.2.3' means 1.23 far more often than it means 1.2 — dropping the tail
  // would silently discard a digit the reader typed on purpose.
  assert.equal(sanitizeGigBudgetText('1.2.3', 'USDC_SOL'), '1.23')
})

test('gigBudgetToRaw: exact at 18 decimals, where float math is not', () => {
  assert.equal(gigBudgetToRaw('1', 'cUSD'), '1000000000000000000')
  assert.equal(gigBudgetToRaw('1250.75', 'cUSD'), '1250750000000000000000')
  // The proof that this is not the old math: the float version of the same
  // conversion does not produce these digits.
  assert.notEqual(String(Math.round(1250.75 * 10 ** 18)), '1250750000000000000000')
})

test('gigBudgetToRaw: an empty or partial field is "not set", never 0', () => {
  // 0 was the old sentinel, and it is a legitimate number — '' cannot be
  // confused for a budget somebody chose.
  assert.equal(gigBudgetToRaw('', 'USDC_SOL'), '')
  assert.equal(gigBudgetToRaw('   ', 'USDC_SOL'), '')
  assert.equal(gigBudgetToRaw('.', 'USDC_SOL'), '')
  assert.equal(gigBudgetToRaw('12.', 'USDC_SOL'), '12000000')
  assert.equal(gigBudgetToRaw('0', 'USDC_SOL'), '0')
})

test('gigBudgetToRaw: a LEADING dot is 0.x, not a vanished budget', () => {
  // '.5' is what a decimal-pad user types, and parseUnits wants a digit
  // before the point — so the field showed .5 and the composer reported no
  // budget at all. Same failure as the trailing dot, from the other end.
  assert.equal(gigBudgetToRaw('.5', 'USDC_SOL'), '500000')
  assert.equal(gigBudgetToRaw('.000001', 'USDC_SOL'), '1')
  assert.equal(gigBudgetToRaw('.', 'USDC_SOL'), '')
  // And through the field, which is how it actually arrives.
  assert.equal(gigBudgetToRaw(sanitizeGigBudgetText('.5', 'USDC_SOL'), 'USDC_SOL'), '500000')
})

test('gigBudgetFromUnits: refuses a magnitude toFixed would render as an EXPONENT', () => {
  // toFixed switches to exponential notation at 1e21, and '1e+21' reaching
  // parseUnits is a silent '' — so the guard is explicit rather than relying
  // on a property toFixed does not have.
  assert.equal((1e21).toFixed(18), '1e+21')
  assert.equal(gigBudgetFromUnits(1e21, 'USDC_SOL'), '')
  assert.equal(gigBudgetFromUnits(1e20, 'USDC_SOL'), '100000000000000000000000000')
  assert.equal(gigBudgetFromUnits(0, 'USDC_SOL'), '')
  assert.equal(gigBudgetFromUnits(-5, 'USDC_SOL'), '')
  assert.equal(gigBudgetFromUnits(Number.NaN, 'USDC_SOL'), '')
  assert.equal(gigBudgetFromUnits(Number.POSITIVE_INFINITY, 'USDC_SOL'), '')
})

test('gigBudgetToRaw: does NOT clamp — an over-rail budget survives to be reported', () => {
  // Clamping would rewrite the number after the reader stopped looking at it.
  assert.equal(gigBudgetToRaw('999999', 'USDC_SOL'), '999999000000')
})

test('gigBudgetToText: round-trips a raw amount back to the field, 18 decimals included', () => {
  for (const [text, asset] of [
    ['12.5', 'USDC_SOL'],
    ['1250.75', 'cUSD'],
    ['0.001', 'SOL'],
    ['50000', 'cUSD'],
  ] as const) {
    assert.equal(gigBudgetToText(gigBudgetToRaw(text, asset), asset), text)
  }
  assert.equal(gigBudgetToText('', 'USDC_SOL'), '')
})

test('gigBudgetRangeLabel: names the rail in the asset the reader is spending', () => {
  assert.equal(gigBudgetRangeLabel('USDC_SOL'), '1 – 50000 USDC')
  assert.equal(gigBudgetRangeLabel('SOL'), '0.001 – 10000 SOL')
  // The 18-decimal case, which the old fixed-6dp bounds made nonsense of.
  assert.equal(gigBudgetRangeLabel('cUSD'), '1 – 50000 cUSD')
})

test('the budget requirement tells an EMPTY field apart from an out-of-rail one', () => {
  const base = {
    title: 'Fix a tap',
    description: 'Leaking',
    category: 'errand' as const,
    remote: true,
    country: null,
    city: null,
    asset: 'USDC_SOL',
    completionDuration: 86_400,
    proofRequirements: [] as ProofType[],
    proofDraft: emptyProofParamsDraft(),
  }
  assert.equal(getGigStepMissingRequirement('payment', { ...base, paymentRaw: '' }), 'Set a budget')
  assert.equal(
    getGigStepMissingRequirement('payment', { ...base, paymentRaw: '999999000000' }),
    'Budget must be 1 – 50000 USDC',
  )
  assert.equal(
    getGigStepMissingRequirement('payment', { ...base, paymentRaw: '1000000' }),
    null,
  )
})

test('hasGigBudget: only a canonical base-unit string above zero counts as set', () => {
  assert.equal(hasGigBudget('1'), true)
  assert.equal(hasGigBudget('1000000'), true)
  assert.equal(hasGigBudget('1250750000000000000000'), true) // 18dp, past 2^53
})

test('hasGigBudget: refuses a zero, a non-canonical form, and anything unparseable', () => {
  for (const bad of ['', ' ', '0', '1.5', '-1', '+1', '1e6', '0x10', '01', ' 1', 'NaN', 'abc']) {
    assert.equal(hasGigBudget(bad), false, bad)
  }
})

test('hasGigBudget: it is the guard that stops BigInt() throwing mid-render', () => {
  // The reason it is not just `!== ''`. These reach the composer from a
  // draft, a query string or a half-migrated caller, and BigInt throws on
  // each — which would take the whole form down rather than showing an
  // invalid budget.
  for (const bad of ['1.5', 'abc', 'NaN']) {
    assert.throws(() => BigInt(bad), bad)
    assert.equal(hasGigBudget(bad), false, bad)
  }
  // '' is the other half, and it does NOT throw — it is 0n, which would read
  // as a budget of zero rather than as no budget at all.
  assert.equal(BigInt(''), 0n)
  assert.equal(hasGigBudget(''), false)
})

test('gigBudgetToText: a malformed stored amount seeds an EMPTY field, it does not throw', () => {
  // Both clients seed the budget field with this during render, from
  // draft.amount_raw — a server value. BigInt() throws on every one of these,
  // and a throw inside useState's initialiser is a white screen on mount
  // rather than a form that says something. The column is numeric(78,0), so
  // this should not arrive; "should not" is not a reason to crash the
  // composer if it does.
  for (const bad of ['abc', '1.5', '1e21', 'null', 'undefined', '0x10', ' ']) {
    assert.doesNotThrow(() => gigBudgetToText(bad, 'cUSD'), bad)
    assert.equal(gigBudgetToText(bad, 'cUSD'), '', bad)
  }
})

test('gigBudgetToText: a NEGATIVE stored amount is not rendered as a budget', () => {
  // It used to produce '-0.00000000000000000' — a minus sign and a string of
  // zeros in the field, which reads as a real amount and is not one.
  assert.equal(gigBudgetToText('-1', 'cUSD'), '')
})

test('gigBudgetToText: canonical values still round-trip untouched', () => {
  // The guard must not swallow the values it exists to pass through.
  assert.equal(gigBudgetToText('0', 'cUSD'), '0')
  assert.equal(gigBudgetToText('1', 'cUSD'), '0.000000000000000001')
  assert.equal(gigBudgetToText('1250750000000000000000', 'cUSD'), '1250.75')
})

test('an UNKNOWN asset falls back to 9 decimals and its own id as the symbol', () => {
  // A chain manifest can name an asset the registry does not carry. The field
  // must still function rather than dividing by undefined: 9 decimals is the
  // same fallback gigAmountBounds uses, so the two cannot disagree.
  assert.equal(gigBudgetToRaw('1.5', 'NOT_A_REAL_ASSET'), '1500000000')
  assert.equal(gigBudgetToText('1500000000', 'NOT_A_REAL_ASSET'), '1.5')
  assert.equal(sanitizeGigBudgetText('1.1234567890', 'NOT_A_REAL_ASSET'), '1.123456789')
  // The label names the asset itself when there is no symbol for it.
  assert.equal(gigBudgetRangeLabel('NOT_A_REAL_ASSET'), '0.001 – 10000 NOT_A_REAL_ASSET')
})

test('gigBudgetToRaw: text the FIELD would never produce still cannot become a wrong raw', () => {
  // It is exported, so it is callable with text that never went through
  // sanitizeGigBudgetText. Over-precision is refused outright here rather
  // than silently truncated — truncating would be this function guessing at
  // an amount nobody typed.
  assert.equal(gigBudgetToRaw('1.9999999', 'USDC_SOL'), '')
  assert.equal(gigBudgetToRaw('1,000', 'USDC_SOL'), '')
  assert.equal(gigBudgetToRaw('1e6', 'USDC_SOL'), '')
  assert.equal(gigBudgetToRaw('-1', 'USDC_SOL'), '')
})
