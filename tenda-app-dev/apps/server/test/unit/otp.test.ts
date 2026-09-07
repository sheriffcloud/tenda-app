/**
 * lib/otp — channel-agnostic issue/verify, every policy branch: per-identifier
 * + per-user rate limits, expiry, attempt cap, single-use, hash round-trip,
 * pre-account (null user) binding, and the phone/email channel split.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { AppError } from '@server/lib/errors'
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_IDENTIFIER_PER_HOUR,
  OTP_MAX_SENDS_PER_USER_PER_DAY,
  OTP_TTL_SECONDS,
  hashOtpCode,
  isE164,
  isValidOtpIdentifier,
  sendOtp,
  verifyOtp,
  verifyOtpHash,
  type OtpChannel,
  type OtpDeps,
  type OtpStore,
} from '@server/lib/otp'

const NOW = new Date('2026-06-04T12:00:00Z')
const PHONE = '+2348012345678'
const EMAIL = 'user@example.com'

interface StoredOtp {
  id: string
  channel: OtpChannel
  identifier: string
  user_id: string | null
  code_hash: string
  expires_at: Date
  attempts: number
  consumed_at: Date | null
  created_at: Date
}

function makeDeps(opts: { now?: Date } = {}): {
  deps: OtpDeps
  rows: StoredOtp[]
  sent: Array<{ channel: OtpChannel; identifier: string; code: string }>
} {
  const rows: StoredOtp[] = []
  const sent: Array<{ channel: OtpChannel; identifier: string; code: string }> = []
  let seq = 0
  const store: OtpStore = {
    async countRecentByIdentifier(channel, identifier, since) {
      return rows.filter(
        (r) => r.channel === channel && r.identifier === identifier && r.created_at >= since,
      ).length
    },
    async countRecentByUser(user_id, since) {
      return rows.filter((r) => r.user_id === user_id && r.created_at >= since).length
    },
    async insert(row) {
      rows.push({
        ...row,
        id: `otp-${(seq += 1)}`,
        attempts: 0,
        consumed_at: null,
        created_at: opts.now ?? NOW,
      })
    },
    async findActive(channel, identifier, user_id) {
      const active = rows
        .filter(
          (r) =>
            r.channel === channel &&
            r.identifier === identifier &&
            r.user_id === user_id &&
            r.consumed_at === null,
        )
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]
      return active ?? null
    },
    async recordAttempt(id) {
      const row = rows.find((r) => r.id === id)
      if (row) row.attempts += 1
    },
    async consume(id) {
      const row = rows.find((r) => r.id === id)
      if (row) row.consumed_at = opts.now ?? NOW
    },
  }
  const deps: OtpDeps = {
    store,
    // Capture the dispatched message (the seam sendOtp hands the minted code to).
    dispatch: async ({ channel, identifier, code }) => {
      sent.push({ channel, identifier, code })
    },
    now: () => opts.now ?? NOW,
  }
  return { deps, rows, sent }
}

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await p.then(
    () => assert.fail(`expected ${code}`),
    (e) => {
      assert.ok(e instanceof AppError, `expected AppError, got ${e}`)
      assert.strictEqual(e.code, code)
    },
  )
}

test('hashOtpCode/verifyOtpHash round-trip; wrong code and garbage fail', () => {
  const stored = hashOtpCode('123456')
  assert.strictEqual(verifyOtpHash('123456', stored), true)
  assert.strictEqual(verifyOtpHash('123457', stored), false)
  assert.strictEqual(verifyOtpHash('123456', 'not-a-hash'), false)
})

test('isE164 / isValidOtpIdentifier per channel', () => {
  assert.strictEqual(isE164('+2348012345678'), true)
  assert.strictEqual(isE164('08012345678'), false)
  assert.strictEqual(isValidOtpIdentifier('phone', PHONE), true)
  assert.strictEqual(isValidOtpIdentifier('phone', 'nope'), false)
  assert.strictEqual(isValidOtpIdentifier('email', EMAIL), true)
  assert.strictEqual(isValidOtpIdentifier('email', 'not-an-email'), false)
})

test('send issues a 6-digit code with the policy TTL and delivers via the channel', async () => {
  const { deps, rows, sent } = makeDeps()
  const r = await sendOtp(deps, { channel: 'phone', identifier: PHONE, user_id: 'u-1' })
  assert.strictEqual(r.expires_in, OTP_TTL_SECONDS)
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].channel, 'phone')
  assert.match(sent[0].code, /^\d{6}$/)
  assert.strictEqual(rows[0].expires_at.getTime(), NOW.getTime() + OTP_TTL_SECONDS * 1000)
  assert.ok(!rows[0].code_hash.includes(sent[0].code), 'code stored hashed, never plaintext')
})

test('email channel: send + verify round-trips through the email sender', async () => {
  const { deps, sent } = makeDeps()
  await sendOtp(deps, { channel: 'email', identifier: EMAIL, user_id: 'u-1' })
  assert.strictEqual(sent[0].channel, 'email')
  await verifyOtp(deps, { channel: 'email', identifier: EMAIL, code: sent[0].code, user_id: 'u-1' })
})

test('send rejects a malformed identifier per channel', async () => {
  const { deps } = makeDeps()
  await expectCode(sendOtp(deps, { channel: 'phone', identifier: 'nope', user_id: 'u-1' }), 'VALIDATION_ERROR')
  await expectCode(sendOtp(deps, { channel: 'email', identifier: 'nope', user_id: 'u-1' }), 'VALIDATION_ERROR')
})

test('per-identifier hourly limit blocks the 4th send', async () => {
  const { deps } = makeDeps()
  for (let i = 0; i < OTP_MAX_SENDS_PER_IDENTIFIER_PER_HOUR; i += 1) {
    await sendOtp(deps, { channel: 'phone', identifier: PHONE, user_id: `u-${i}` })
  }
  await expectCode(sendOtp(deps, { channel: 'phone', identifier: PHONE, user_id: 'u-x' }), 'OTP_RATE_LIMITED')
})

test('per-user daily limit blocks the 11th send across identifiers (authenticated only)', async () => {
  const { deps } = makeDeps()
  for (let i = 0; i < OTP_MAX_SENDS_PER_USER_PER_DAY; i += 1) {
    await sendOtp(deps, {
      channel: 'phone',
      identifier: `+23480123456${String(i).padStart(2, '0')}`,
      user_id: 'u-1',
    })
  }
  await expectCode(
    sendOtp(deps, { channel: 'phone', identifier: '+2348099999999', user_id: 'u-1' }),
    'OTP_RATE_LIMITED',
  )
})

test('pre-account send (null user) skips the per-user cap; per-identifier still applies', async () => {
  const { deps, sent } = makeDeps()
  // 10+ pre-account sends across DIFFERENT identifiers — no user to attribute,
  // so the per-user/day cap must NOT trip.
  for (let i = 0; i < OTP_MAX_SENDS_PER_USER_PER_DAY + 2; i += 1) {
    await sendOtp(deps, {
      channel: 'email',
      identifier: `pre${i}@example.com`,
      user_id: null,
    })
  }
  assert.strictEqual(sent.length, OTP_MAX_SENDS_PER_USER_PER_DAY + 2)
  // But the per-identifier hourly cap still bites the same address.
  for (let i = 1; i < OTP_MAX_SENDS_PER_IDENTIFIER_PER_HOUR; i += 1) {
    await sendOtp(deps, { channel: 'email', identifier: 'pre0@example.com', user_id: null })
  }
  await expectCode(
    sendOtp(deps, { channel: 'email', identifier: 'pre0@example.com', user_id: null }),
    'OTP_RATE_LIMITED',
  )
})

test('verify consumes a correct code; the same code cannot be reused', async () => {
  const { deps, sent } = makeDeps()
  await sendOtp(deps, { channel: 'phone', identifier: PHONE, user_id: 'u-1' })
  await verifyOtp(deps, { channel: 'phone', identifier: PHONE, code: sent[0].code, user_id: 'u-1' })
  await expectCode(
    verifyOtp(deps, { channel: 'phone', identifier: PHONE, code: sent[0].code, user_id: 'u-1' }),
    'OTP_INVALID',
  )
})

test('verify rejects when no active code exists', async () => {
  const { deps } = makeDeps()
  await expectCode(
    verifyOtp(deps, { channel: 'phone', identifier: PHONE, code: '000000', user_id: 'u-1' }),
    'OTP_INVALID',
  )
})

test('verify rejects an expired code', async () => {
  const { deps, sent } = makeDeps()
  await sendOtp(deps, { channel: 'phone', identifier: PHONE, user_id: 'u-1' })
  const late = { ...deps, now: () => new Date(NOW.getTime() + (OTP_TTL_SECONDS + 1) * 1000) }
  await expectCode(
    verifyOtp(late, { channel: 'phone', identifier: PHONE, code: sent[0].code, user_id: 'u-1' }),
    'OTP_EXPIRED',
  )
})

test('5 wrong attempts invalidate the OTP even with the right code after', async () => {
  const { deps, sent } = makeDeps()
  await sendOtp(deps, { channel: 'phone', identifier: PHONE, user_id: 'u-1' })
  const wrong = sent[0].code === '000000' ? '111111' : '000000'
  for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
    await expectCode(
      verifyOtp(deps, { channel: 'phone', identifier: PHONE, code: wrong, user_id: 'u-1' }),
      'OTP_INVALID',
    )
  }
  await expectCode(
    verifyOtp(deps, { channel: 'phone', identifier: PHONE, code: sent[0].code, user_id: 'u-1' }),
    'OTP_INVALID',
  )
})

test('a code issued to one user cannot be consumed by another account', async () => {
  const { deps, sent } = makeDeps()
  await sendOtp(deps, { channel: 'phone', identifier: PHONE, user_id: 'u-1' })
  await expectCode(
    verifyOtp(deps, { channel: 'phone', identifier: PHONE, code: sent[0].code, user_id: 'u-2' }),
    'OTP_INVALID',
  )
  // A pre-account (null user) verify must also not pick up a user-bound code.
  await expectCode(
    verifyOtp(deps, { channel: 'phone', identifier: PHONE, code: sent[0].code, user_id: null }),
    'OTP_INVALID',
  )
  await verifyOtp(deps, { channel: 'phone', identifier: PHONE, code: sent[0].code, user_id: 'u-1' })
})
