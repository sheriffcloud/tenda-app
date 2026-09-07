/**
 * lib/otp — the OtpSender transports the main otp suite leaves uncovered
 * (it injects a fake sender): termiiSender (fetch-stubbed POST + non-2xx
 * 502) and consoleSender (dev fallback that logs, never throws).
 */

import { test, afterEach } from 'node:test'
import * as assert from 'node:assert'
import {
  termiiSender,
  twilioSmsSender,
  routedSmsSender,
  composePhoneSender,
  otpSmsText,
  consoleSender,
  emailOtpSender,
  TERMII_SMS_URL,
  TWILIO_API_BASE,
  type OtpSender,
} from '@server/lib/otp'
import { sendViaResend, RESEND_API_URL } from '@server/lib/email'
import { resendSender } from '@server/lib/admin-otp'
import { restoreFetch, stubFetch } from '../helpers/fetch-stub'
import { AppError } from '@server/lib/errors'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

test('termiiSender: POSTs to Termii with the code embedded in the SMS body', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    calls.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') })
    return { ok: true, status: 200 } as Response
  }) as typeof fetch

  await termiiSender({ api_key: 'K', sender_id: 'Tenda' }).send('+2348012345678', '123456')
  assert.strictEqual(calls[0].url, TERMII_SMS_URL)
  assert.strictEqual(calls[0].body.api_key, 'K')
  assert.strictEqual(calls[0].body.to, '+2348012345678')
  assert.strictEqual(calls[0].body.from, 'Tenda')
  assert.match(String(calls[0].body.sms), /123456/)
})

test('termiiSender: non-2xx → 502 AppError carrying the status', async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch
  await assert.rejects(
    () => termiiSender({ api_key: 'K', sender_id: 'S' }).send('+2348000000000', '000000'),
    (e: unknown) => e instanceof AppError && e.statusCode === 502 && /status 500/.test(e.message),
  )
})

test('otpSmsText: embeds the code (single source shared by every SMS transport)', () => {
  assert.match(otpSmsText('424242'), /424242/)
})

test('SMS senders attach an abort signal — a hung provider cannot hold a worker slot', async () => {
  const signals: unknown[] = []
  globalThis.fetch = (async (_url: string, init?: { signal?: unknown }) => {
    signals.push(init?.signal)
    return { ok: true, status: 200 } as Response
  }) as typeof fetch

  await termiiSender({ api_key: 'K', sender_id: 'S' }).send('+2348000000000', '111111')
  await twilioSmsSender({ account_sid: 'AC', auth_token: 't', from: '+1' }).send('+1999', '222222')
  assert.strictEqual(signals.length, 2)
  for (const s of signals) assert.ok(s instanceof AbortSignal, 'fetch must carry an AbortSignal')
})

test('SMS senders: a provider timeout rejects (surfaces to the send-otp retry path)', async () => {
  globalThis.fetch = (async () => {
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
  }) as typeof fetch

  await assert.rejects(
    () => termiiSender({ api_key: 'K', sender_id: 'S' }).send('+2348000000000', '000000'),
    (e: unknown) => e instanceof DOMException && e.name === 'TimeoutError',
  )
  await assert.rejects(
    () => twilioSmsSender({ account_sid: 'AC', auth_token: 't', from: '+1' }).send('+1999', '000000'),
    (e: unknown) => e instanceof DOMException && e.name === 'TimeoutError',
  )
})

test('twilioSmsSender: POSTs to the Messages API with Basic auth + the code in the body', async () => {
  const calls: { url: string; auth: string; body: string }[] = []
  globalThis.fetch = (async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
    calls.push({ url: String(url), auth: init?.headers?.Authorization ?? '', body: init?.body ?? '' })
    return { ok: true, status: 201 } as Response
  }) as typeof fetch

  await twilioSmsSender({ account_sid: 'AC123', auth_token: 'tok', from: '+15550000000' }).send(
    '+447700900000',
    '135790',
  )
  assert.strictEqual(calls[0].url, `${TWILIO_API_BASE}/Accounts/AC123/Messages.json`)
  // Basic base64('AC123:tok').
  assert.strictEqual(calls[0].auth, `Basic ${Buffer.from('AC123:tok').toString('base64')}`)
  const form = new URLSearchParams(calls[0].body)
  assert.strictEqual(form.get('To'), '+447700900000')
  assert.strictEqual(form.get('From'), '+15550000000')
  assert.match(form.get('Body') ?? '', /135790/)
})

test('twilioSmsSender: an MG… Messaging Service SID is sent as MessagingServiceSid, not From', async () => {
  const bodies: string[] = []
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    bodies.push(init?.body ?? '')
    return { ok: true, status: 201 } as Response
  }) as typeof fetch

  await twilioSmsSender({ account_sid: 'AC1', auth_token: 't', from: 'MG0123456789' }).send('+1999', '000000')
  const form = new URLSearchParams(bodies[0])
  assert.strictEqual(form.get('MessagingServiceSid'), 'MG0123456789')
  assert.strictEqual(form.get('From'), null) // never both — Twilio rejects an MG SID in From
})

test('twilioSmsSender: non-2xx → 502 AppError carrying the status', async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 401 }) as Response) as typeof fetch
  await assert.rejects(
    () => twilioSmsSender({ account_sid: 'AC', auth_token: 't', from: '+1' }).send('+1999', '000000'),
    (e: unknown) => e instanceof AppError && e.statusCode === 502 && /status 401/.test(e.message),
  )
})

test('routedSmsSender: matching prefix → route sender; everything else → fallback', async () => {
  const hit: string[] = []
  const fake = (label: string): OtpSender => ({
    async send(identifier) {
      hit.push(`${label}:${identifier}`)
    },
  })
  const sender = routedSmsSender([{ prefixes: ['+234'], sender: fake('termii') }], fake('twilio'))

  await sender.send('+2348012345678', '111111') // matches → termii
  await sender.send('+447700900000', '222222') // no match → twilio fallback
  assert.deepStrictEqual(hit, ['termii:+2348012345678', 'twilio:+447700900000'])
})

test('composePhoneSender: routes by provider availability across all four cases', async () => {
  const tag = (label: string, sink: string[]): OtpSender => ({
    async send(identifier) {
      sink.push(`${label}:${identifier}`)
    },
  })

  // both → +234 to Termii, rest to Twilio.
  const both: string[] = []
  await composePhoneSender({
    termii: tag('termii', both), twilio: tag('twilio', both), prefixes: ['+234'], fallback: tag('console', both),
  }).send('+2348011112222', '1')
  await composePhoneSender({
    termii: tag('termii', both), twilio: tag('twilio', both), prefixes: ['+234'], fallback: tag('console', both),
  }).send('+447700900000', '2')
  assert.deepStrictEqual(both, ['termii:+2348011112222', 'twilio:+447700900000'])

  // twilio-only → all numbers to Twilio (even +234).
  const tw: string[] = []
  await composePhoneSender({ termii: null, twilio: tag('twilio', tw), prefixes: ['+234'], fallback: tag('c', tw) })
    .send('+2348000000000', '3')
  assert.deepStrictEqual(tw, ['twilio:+2348000000000'])

  // termii-only → all numbers to Termii.
  const tm: string[] = []
  await composePhoneSender({ termii: tag('termii', tm), twilio: null, prefixes: ['+234'], fallback: tag('c', tm) })
    .send('+447700900000', '4')
  assert.deepStrictEqual(tm, ['termii:+447700900000'])

  // neither → the dev fallback (console).
  const none: string[] = []
  await composePhoneSender({ termii: null, twilio: null, prefixes: ['+234'], fallback: tag('console', none) })
    .send('+10000000000', '5')
  assert.deepStrictEqual(none, ['console:+10000000000'])
})

test('consoleSender: logs the code + identifier + channel and never throws', async () => {
  const logs: { obj: Record<string, unknown>; msg: string }[] = []
  await consoleSender(
    { warn: (obj, msg) => logs.push({ obj: obj as Record<string, unknown>, msg }) },
    'email',
  ).send('a@x.io', '654321')
  assert.strictEqual(logs.length, 1)
  assert.strictEqual(logs[0].obj.code, '654321')
  assert.strictEqual(logs[0].obj.identifier, 'a@x.io')
  assert.strictEqual(logs[0].obj.channel, 'email')
})

test('emailOtpSender: POSTs to Resend with the code in the body', async () => {
  const calls: { url: string; body: Record<string, unknown>; auth: string }[] = []
  globalThis.fetch = (async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
    calls.push({
      url: String(url),
      body: JSON.parse(init?.body ?? '{}'),
      auth: init?.headers?.Authorization ?? '',
    })
    return { ok: true, status: 200 } as Response
  }) as typeof fetch

  await emailOtpSender({ api_key: 'K', from: 'no-reply@tenda.app' }).send('user@x.io', '424242')
  assert.strictEqual(calls[0].url, RESEND_API_URL)
  assert.strictEqual(calls[0].auth, 'Bearer K')
  assert.deepStrictEqual(calls[0].body.to, ['user@x.io'])
  assert.match(String(calls[0].body.text), /424242/)
})

test('sendViaResend: non-2xx → 502 AppError carrying the status', async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 422 }) as Response) as typeof fetch
  await assert.rejects(
    () => sendViaResend({ api_key: 'K', from: 'f@x.io' }, { to: 't@x.io', subject: 's', text: 'b' }),
    (e: unknown) => e instanceof AppError && e.statusCode === 502 && /status 422/.test(e.message),
  )
})

// ---------- admin login mail (lib/admin-otp) ---------------------------------

test('admin resendSender: POSTs the login code to Resend with bearer auth', async () => {
  // The branch that actually sends admin login mail (#110). T5a covered which
  // sender gets SELECTED — including the 503 when nothing is configured — but
  // never the sending, so the request this puts on the wire was unasserted.
  //
  // The shared `stubFetch` rather than this file's older local literal: it
  // returns a real Response, so `ok` cannot disagree with `status`. See
  // helpers/fetch-stub's header for the fixtures that flaw produced.
  const calls = stubFetch({ status: 200 })

  await resendSender({ api_key: 'K', from: 'admin@tenda.test' }).send('boss@tenda.test', '424242')

  assert.strictEqual(calls.length, 1)
  assert.strictEqual(calls[0].url, RESEND_API_URL)
  const headers = calls[0].init.headers as Record<string, string>
  assert.strictEqual(headers.Authorization, 'Bearer K')
  const body = JSON.parse(String(calls[0].init.body)) as {
    from: string
    to: string[]
    subject: string
    text: string
  }
  assert.strictEqual(body.from, 'admin@tenda.test')
  assert.deepStrictEqual(body.to, ['boss@tenda.test'])
  assert.match(body.subject, /admin login code/i)
  assert.match(body.text, /424242/, 'the code the admin has to type must be in the mail')
  assert.match(body.text, /10 minutes/, 'and how long it lasts')
  restoreFetch()
})

test('admin resendSender: a non-2xx from Resend surfaces as 502, not a silent no-send', async () => {
  // The admin cannot log in either way; the difference is whether the operator
  // is told. A swallowed failure looks exactly like an email that never arrived.
  stubFetch({ status: 500 })
  await assert.rejects(
    () => resendSender({ api_key: 'K', from: 'a@b.c' }).send('boss@tenda.test', '000000'),
    (e: unknown) => e instanceof AppError && e.statusCode === 502 && /status 500/.test(e.message),
  )
  restoreFetch()
})
