import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  E164_RE,
  isE164,
  normalizeEmail,
  EMAIL_MAX_LENGTH,
  isValidLatitude,
  isValidLongitude,
  gigAmountBounds,
  isValidGigAmountRaw,
  MIN_COMPLETION_DURATION_SECONDS,
  MAX_COMPLETION_DURATION_SECONDS,
  isValidCompletionDuration,
  isCloudinaryUrl,
  isValidWalletAddress,
  isValidReviewScore,
  validateGigDeadlines,
} from '../../src/utils/validation'
import { ASSET_META } from '../../src/constants/assets'
import { parseUnits } from '../../src/utils/units'

test('isE164: accepts a valid E.164 number', () => {
  assert.equal(isE164('+2348012345678'), true)
  assert.equal(E164_RE.test('+447911123456'), true)
})

test('isE164: rejects missing +, leading zero, too short, too long, non-string', () => {
  assert.equal(isE164('2348012345678'), false) // no +
  assert.equal(isE164('+0348012345678'), false) // leading 0 after +
  assert.equal(isE164('+1234567'), false) // 7 digits — below 8 minimum
  assert.equal(isE164('+1234567890123456'), false) // 16 digits — above 15
  assert.equal(isE164(1234), false)
  assert.equal(isE164(null), false)
  assert.equal(isE164(undefined), false)
})

test('isValidLatitude: in-range, boundaries, out-of-range, non-finite', () => {
  assert.equal(isValidLatitude(0), true)
  assert.equal(isValidLatitude(-90), true)
  assert.equal(isValidLatitude(90), true)
  assert.equal(isValidLatitude(-90.0001), false)
  assert.equal(isValidLatitude(90.0001), false)
  assert.equal(isValidLatitude(NaN), false)
  assert.equal(isValidLatitude(Infinity), false)
})

test('isValidLongitude: in-range, boundaries, out-of-range, non-finite', () => {
  assert.equal(isValidLongitude(0), true)
  assert.equal(isValidLongitude(-180), true)
  assert.equal(isValidLongitude(180), true)
  assert.equal(isValidLongitude(-180.0001), false)
  assert.equal(isValidLongitude(180.0001), false)
  assert.equal(isValidLongitude(NaN), false)
})

test('gigAmountBounds: the SAME display rail scaled by each asset\'s own decimals', () => {
  // The bug this replaced: bounds were fixed 6dp numbers for every stable
  // asset. Asserted against parseUnits of the display rail rather than against
  // literals, so a change to the rail cannot leave this test passing while
  // meaning something else.
  assert.deepEqual(gigAmountBounds('USDC_SOL'), { min_raw: '1000000', max_raw: '50000000000' })
  assert.deepEqual(gigAmountBounds('SOL'), { min_raw: '1000000', max_raw: '10000000000000' })

  // cUSD: stable AND 18 decimals — the combination the old code got wrong. It
  // would have handed back the 6dp rails, capping a budget at 0.00000005 cUSD.
  assert.equal(ASSET_META.cUSD.decimals, 18)
  assert.equal(ASSET_META.cUSD.is_stable, true)
  assert.deepEqual(gigAmountBounds('cUSD'), {
    min_raw: parseUnits('1', 18),
    max_raw: parseUnits('50000', 18),
  })
  assert.equal(gigAmountBounds('cUSD').max_raw, '50000000000000000000000')

  // Unknown asset: not stable, no decimals → the native rail at 9dp, which is
  // what the old lamport default produced.
  assert.deepEqual(gigAmountBounds('NOT_A_REAL_ASSET'), {
    min_raw: '1000000',
    max_raw: '10000000000000',
  })
})

test('isValidGigAmountRaw: boundaries are INCLUSIVE, one base unit outside is not', () => {
  const { min_raw, max_raw } = gigAmountBounds('USDC_SOL')
  assert.equal(isValidGigAmountRaw('USDC_SOL', min_raw), true)
  assert.equal(isValidGigAmountRaw('USDC_SOL', max_raw), true)
  assert.equal(isValidGigAmountRaw('USDC_SOL', (BigInt(min_raw) - 1n).toString()), false)
  assert.equal(isValidGigAmountRaw('USDC_SOL', (BigInt(max_raw) + 1n).toString()), false)
  assert.equal(isValidGigAmountRaw('SOL', gigAmountBounds('SOL').min_raw), true)
})

test('isValidGigAmountRaw: the BOUNDARY is exact at 18 decimals, where a double is not', () => {
  // The case that catches a Number() comparison, and it is the MINIMUM that
  // gives it away. The 6dp boundary test above passes against a float
  // implementation too — 1e6 and its neighbours are exactly representable —
  // so it proves nothing about precision.
  //
  // At 18 decimals the floor is 1e18, and 1e18 - 1 rounds to exactly the same
  // double. A float comparison therefore reads a budget ONE BASE UNIT BELOW
  // the rail as being on it, and lets it through.
  const { min_raw, max_raw } = gigAmountBounds('cUSD')
  const underMin = (BigInt(min_raw) - 1n).toString()

  // The blind spot itself, stated as fact rather than assumed.
  assert.equal(Number(underMin), Number(min_raw))
  assert.equal(Number(underMin) >= Number(min_raw), true) // what a float would answer

  // What this implementation answers.
  assert.equal(isValidGigAmountRaw('cUSD', underMin), false)
  assert.equal(isValidGigAmountRaw('cUSD', min_raw), true)
  assert.equal(isValidGigAmountRaw('cUSD', max_raw), true)
  assert.equal(isValidGigAmountRaw('cUSD', (BigInt(max_raw) + 1n).toString()), false)
})

test('isValidGigAmountRaw: an 18-decimal budget survives, where a number could not', () => {
  // The case that motivated the migration. 1 cUSD is 1e18 base units — beyond
  // Number.MAX_SAFE_INTEGER, so the previous `number` signature could not
  // represent it at all. The proof is not that this returns true, but that the
  // value round-trips through BigInt with every digit intact: as a double,
  // 1e18 + 1 is indistinguishable from 1e18.
  const oneToken = parseUnits('1', 18)
  assert.equal(oneToken, '1000000000000000000')
  assert.equal(isValidGigAmountRaw('cUSD', oneToken), true)
  assert.ok(BigInt(oneToken) > BigInt(Number.MAX_SAFE_INTEGER))
  assert.notEqual(BigInt(oneToken) + 1n, BigInt(oneToken))
  assert.equal(Number(oneToken) + 1, Number(oneToken)) // what number does to it

  // And a real budget in the middle of the rail, not just the unit.
  const budget = parseUnits('1250.75', 18)
  assert.equal(budget, '1250750000000000000000')
  assert.equal(isValidGigAmountRaw('cUSD', budget), true)
})

test('isValidGigAmountRaw: refuses anything that is not a canonical base-unit string', () => {
  // The signature is `string`, so these arrive from JSON, a query param, or a
  // half-migrated caller — not from the type checker.
  for (const bad of ['', ' ', '1e6', '1.5', '-1000000', '+1000000', ' 1000000', '01000000', 'NaN', '0x64']) {
    assert.equal(isValidGigAmountRaw('USDC_SOL', bad), false, bad)
  }
})

test('isValidCompletionDuration: boundaries, below/above, non-integer', () => {
  assert.equal(isValidCompletionDuration(MIN_COMPLETION_DURATION_SECONDS), true)
  assert.equal(isValidCompletionDuration(MAX_COMPLETION_DURATION_SECONDS), true)
  assert.equal(isValidCompletionDuration(MIN_COMPLETION_DURATION_SECONDS - 1), false)
  assert.equal(isValidCompletionDuration(MAX_COMPLETION_DURATION_SECONDS + 1), false)
  assert.equal(isValidCompletionDuration(3600.5), false)
})

test('isCloudinaryUrl: accepts res.cloudinary.com only, rejects other hosts and malformed URLs', () => {
  assert.equal(isCloudinaryUrl('https://res.cloudinary.com/demo/image/upload/x.jpg'), true)
  assert.equal(isCloudinaryUrl('https://evil.com/res.cloudinary.com/x.jpg'), false)
  assert.equal(isCloudinaryUrl('http://res.cloudinary.com.attacker.net/x'), false)
  assert.equal(isCloudinaryUrl('not a url'), false) // throws inside → caught → false
  assert.equal(isCloudinaryUrl(''), false)
})

test('isValidWalletAddress: base58 length window, rejects too short / 0x / illegal chars', () => {
  assert.equal(isValidWalletAddress('9xQpFv7c1mWq8s2RpKf3hYzAbCdEfGhJkLmNpQrStUv'), true) // 43 chars base58
  assert.equal(isValidWalletAddress('short'), false)
  assert.equal(isValidWalletAddress('0x1234567890abcdef1234567890abcdef12345678'), false) // 0x has invalid base58 chars
  assert.equal(isValidWalletAddress('0OIl' + 'a'.repeat(36)), false) // 0,O,I,l are excluded from base58
})

test('isValidReviewScore: 1–5 integers only', () => {
  for (const s of [1, 2, 3, 4, 5]) assert.equal(isValidReviewScore(s), true)
  assert.equal(isValidReviewScore(0), false)
  assert.equal(isValidReviewScore(6), false)
  assert.equal(isValidReviewScore(3.5), false)
  assert.equal(isValidReviewScore('5'), false)
  assert.equal(isValidReviewScore(null), false)
})

test('validateGigDeadlines: rejects out-of-range duration', () => {
  const r = validateGigDeadlines(10)
  assert.equal(r.valid, false)
  assert.match(r.error ?? '', /completion_duration_seconds must be between/)
})

test('validateGigDeadlines: valid duration with no accept_deadline passes', () => {
  assert.deepEqual(validateGigDeadlines(MIN_COMPLETION_DURATION_SECONDS), { valid: true })
  assert.deepEqual(validateGigDeadlines(MIN_COMPLETION_DURATION_SECONDS, null), { valid: true })
})

test('validateGigDeadlines: rejects an unparseable accept_deadline', () => {
  const r = validateGigDeadlines(MIN_COMPLETION_DURATION_SECONDS, 'not-a-date')
  assert.equal(r.valid, false)
  assert.equal(r.error, 'accept_deadline is not a valid date')
})

test('validateGigDeadlines: rejects a past accept_deadline', () => {
  const past = new Date(Date.now() - 60_000).toISOString()
  const r = validateGigDeadlines(MIN_COMPLETION_DURATION_SECONDS, past)
  assert.equal(r.valid, false)
  assert.equal(r.error, 'accept_deadline must be in the future')
})

test('validateGigDeadlines: accepts a future accept_deadline', () => {
  const future = new Date(Date.now() + 3_600_000).toISOString()
  assert.deepEqual(validateGigDeadlines(MIN_COMPLETION_DURATION_SECONDS, future), { valid: true })
})

// --- normalizeEmail --------------------------------------------------------

/**
 * "Write sites MUST use this" — so a stored address is always the canonical
 * form, and two users cannot register the same mailbox in different cases.
 */
test('normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  User@Example.COM  '), 'user@example.com')
  // Idempotent: normalising an already-normal address must not change it.
  assert.equal(normalizeEmail('user@example.com'), 'user@example.com')
})

test('normalizeEmail rejects malformed shapes rather than storing them', () => {
  for (const bad of ['', '   ', 'no-at-sign', 'a@b', 'a@b.', '@example.com', 'a b@example.com']) {
    assert.equal(normalizeEmail(bad), null, `expected null for ${JSON.stringify(bad)}`)
  }
})

test('normalizeEmail enforces the length cap on the TRIMMED value', () => {
  const local = 'a'.repeat(EMAIL_MAX_LENGTH - '@example.com'.length)
  const atCap = `${local}@example.com`
  assert.equal(atCap.length, EMAIL_MAX_LENGTH)
  assert.equal(normalizeEmail(atCap), atCap, 'exactly at the cap is valid')
  assert.equal(normalizeEmail(`a${atCap}`), null, 'one over the cap is not')
  // Whitespace must not count toward the cap — it is trimmed first.
  assert.equal(normalizeEmail(`  ${atCap}  `), atCap)
})

test('gigAmountBounds: EVERY registered asset gets a usable rail', () => {
  // The invariant railToRaw exists to hold. A rail written at a finer
  // precision than an asset supports ('0.001' on a 2-decimal asset) used to
  // collapse the minimum to '0', removing the floor and accepting any budget
  // above zero. No asset is below 6 decimals today — which is exactly why
  // this is a guard over the REGISTRY rather than one hand-picked case: it
  // starts failing on the day someone adds one, not before.
  for (const asset of Object.keys(ASSET_META)) {
    const { min_raw, max_raw } = gigAmountBounds(asset)
    assert.ok(BigInt(min_raw) > 0n, `${asset} min`)
    assert.ok(BigInt(max_raw) > BigInt(min_raw), `${asset} max`)
    // And the rail is actually reachable through the validator.
    assert.equal(isValidGigAmountRaw(asset, min_raw), true, `${asset} accepts its min`)
    assert.equal(isValidGigAmountRaw(asset, max_raw), true, `${asset} accepts its max`)
  }
})
