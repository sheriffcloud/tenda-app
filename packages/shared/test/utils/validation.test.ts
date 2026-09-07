import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  E164_RE,
  isE164,
  normalizeEmail,
  EMAIL_MAX_LENGTH,
  isValidLatitude,
  isValidLongitude,
  MIN_PAYMENT_LAMPORTS,
  MAX_PAYMENT_LAMPORTS,
  isValidPaymentLamports,
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
import { GIG_STABLE_MIN_RAW, GIG_STABLE_MAX_RAW } from '../../src/constants/assets'

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

test('isValidPaymentLamports: boundaries inclusive, below/above, non-integer', () => {
  assert.equal(isValidPaymentLamports(MIN_PAYMENT_LAMPORTS), true)
  assert.equal(isValidPaymentLamports(MAX_PAYMENT_LAMPORTS), true)
  assert.equal(isValidPaymentLamports(MIN_PAYMENT_LAMPORTS - 1), false)
  assert.equal(isValidPaymentLamports(MAX_PAYMENT_LAMPORTS + 1), false)
  assert.equal(isValidPaymentLamports(1_000_000.5), false)
  assert.equal(isValidPaymentLamports(NaN), false)
})

test('gigAmountBounds: stable assets get USDC rails, native gets lamport rails, unknown falls back to lamports', () => {
  assert.deepEqual(gigAmountBounds('USDC_SOL'), { min_raw: GIG_STABLE_MIN_RAW, max_raw: GIG_STABLE_MAX_RAW })
  assert.deepEqual(gigAmountBounds('SOL'), { min_raw: MIN_PAYMENT_LAMPORTS, max_raw: MAX_PAYMENT_LAMPORTS })
  // Unknown asset is not stable → lamport rails (default branch).
  assert.deepEqual(gigAmountBounds('NOT_A_REAL_ASSET'), {
    min_raw: MIN_PAYMENT_LAMPORTS,
    max_raw: MAX_PAYMENT_LAMPORTS,
  })
})

test('isValidGigAmountRaw: stable + native boundaries and rejections', () => {
  assert.equal(isValidGigAmountRaw('USDC_SOL', GIG_STABLE_MIN_RAW), true)
  assert.equal(isValidGigAmountRaw('USDC_SOL', GIG_STABLE_MAX_RAW), true)
  assert.equal(isValidGigAmountRaw('USDC_SOL', GIG_STABLE_MIN_RAW - 1), false)
  assert.equal(isValidGigAmountRaw('USDC_SOL', GIG_STABLE_MAX_RAW + 1), false)
  assert.equal(isValidGigAmountRaw('SOL', MIN_PAYMENT_LAMPORTS), true)
  assert.equal(isValidGigAmountRaw('USDC_SOL', 1_000_000.5), false) // non-integer
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
