/**
 * lib/otp delivery seam — `deliverOtp` (channel routing) + `otpDispatch`
 * (queue-vs-inline selection). These back the bigger-hammer fix: the auth
 * challenge persists the code then hands delivery to `dispatch`, so the
 * response never blocks on the email/SMS provider.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { deliverOtp, otpDispatch, type OtpMessage } from '@server/lib/otp'
import type { OtpChannel } from '@tenda/shared/db/schema'
import type { OtpSender } from '@server/lib/otp'

interface Recorder {
  calls: Array<{ identifier: string; code: string }>
}

/** A sender that records its calls; optionally throws to model a provider failure. */
function fakeSender(opts: { throws?: Error } = {}): OtpSender & Recorder {
  const calls: Array<{ identifier: string; code: string }> = []
  return {
    calls,
    async send(identifier, code) {
      calls.push({ identifier, code })
      if (opts.throws) throw opts.throws
    },
  }
}

function senders(): Record<OtpChannel, OtpSender & Recorder> {
  return { phone: fakeSender(), email: fakeSender() }
}

const PHONE_MSG: OtpMessage = { channel: 'phone', identifier: '+2348012345678', code: '123456' }
const EMAIL_MSG: OtpMessage = { channel: 'email', identifier: 'a@b.com', code: '654321' }

// ---------- deliverOtp -------------------------------------------------------

test('deliverOtp routes to the message channel and passes identifier + code', async () => {
  const s = senders()
  await deliverOtp(s, PHONE_MSG)
  await deliverOtp(s, EMAIL_MSG)
  assert.deepStrictEqual(s.phone.calls, [{ identifier: '+2348012345678', code: '123456' }])
  assert.deepStrictEqual(s.email.calls, [{ identifier: 'a@b.com', code: '654321' }])
})

test('deliverOtp propagates a sender failure (so BullMQ retries)', async () => {
  const boom = new Error('provider 502')
  const s: Record<OtpChannel, OtpSender> = { phone: fakeSender({ throws: boom }), email: fakeSender() }
  await assert.rejects(deliverOtp(s, PHONE_MSG), /provider 502/)
})

// ---------- otpDispatch ------------------------------------------------------

test('otpDispatch: with a queue, enqueues and never builds inline senders', async () => {
  const enqueued: OtpMessage[] = []
  let inlineBuilt = false
  const dispatch = otpDispatch({
    enqueue: async (msg) => {
      enqueued.push(msg)
    },
    inlineSenders: () => {
      inlineBuilt = true
      return senders()
    },
  })
  await dispatch(EMAIL_MSG)
  assert.deepStrictEqual(enqueued, [EMAIL_MSG])
  assert.strictEqual(inlineBuilt, false, 'inline senders must not be built on the queue path')
})

test('otpDispatch: without a queue, sends inline and builds senders exactly once', async () => {
  const s = senders()
  let builds = 0
  const dispatch = otpDispatch({
    enqueue: null,
    inlineSenders: () => {
      builds += 1
      return s
    },
  })
  await dispatch(PHONE_MSG)
  await dispatch(EMAIL_MSG)
  assert.strictEqual(builds, 1, 'senders built once at wiring time, reused per send')
  assert.deepStrictEqual(s.phone.calls, [{ identifier: '+2348012345678', code: '123456' }])
  assert.deepStrictEqual(s.email.calls, [{ identifier: 'a@b.com', code: '654321' }])
})
