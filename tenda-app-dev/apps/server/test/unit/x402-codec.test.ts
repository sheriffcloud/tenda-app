/**
 * The x402 envelope codec (lib/x402): what the X-PAYMENT header must look
 * like to reach an adapter at all, and the X-PAYMENT-RESPONSE round trip.
 * Shape only — whether the artifact matches the terms is the adapters' job.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { TENDA_RELAY_SCHEME, X402_VERSION } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { assertRelayEnvelope, decodePaymentHeader, encodeSettlementHeader } from '@server/lib/x402'

const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64')

const AUTHORIZATION = {
  from: `0x${'11'.repeat(20)}`,
  to: `0x${'22'.repeat(20)}`,
  value: '25000000',
  validAfter: '0',
  validBefore: '1900000000',
  nonce: `0x${'33'.repeat(32)}`,
}
const ENVELOPE = {
  x402Version: X402_VERSION,
  scheme: TENDA_RELAY_SCHEME,
  network: 'eip155:84532',
  payload: { signature: `0x${'44'.repeat(65)}`, authorization: AUTHORIZATION },
}

function expect400(raw: string | string[] | undefined, pattern: RegExp): void {
  assert.throws(
    () => decodePaymentHeader(raw),
    (err: unknown) =>
      err instanceof AppError && err.statusCode === 400 && err.code === 'VALIDATION_ERROR' && pattern.test(err.message),
    `expected 400 matching ${pattern}`,
  )
}

test('no header decodes to undefined — the 402 path, not an error', () => {
  assert.strictEqual(decodePaymentHeader(undefined), undefined)
})

test('an EVM authorization envelope decodes field-for-field, typed by inspection', () => {
  const decoded = decodePaymentHeader(b64(ENVELOPE))
  assert.deepStrictEqual(decoded, ENVELOPE)
})

test('a Solana transaction envelope decodes', () => {
  const env = { ...ENVELOPE, network: 'solana:devnet', payload: { transaction: 'AAAA' } }
  assert.deepStrictEqual(decodePaymentHeader(b64(env)), env)
})

test('a foreign scheme is a WELL-FORMED envelope (decodes) that the envelope check then refuses as 422', () => {
  const foreign = decodePaymentHeader(b64({ ...ENVELOPE, scheme: 'exact' }))
  assert.strictEqual(foreign?.scheme, 'exact')
  assert.throws(
    () => assertRelayEnvelope(foreign!, 'eip155:84532'),
    (err: unknown) => err instanceof AppError && err.statusCode === 422 && err.code === 'RELAY_REJECTED',
  )
  // The right scheme on the wrong network is refused the same way …
  assert.throws(
    () => assertRelayEnvelope(decodePaymentHeader(b64(ENVELOPE))!, 'eip155:8453'),
    (err: unknown) => err instanceof AppError && err.code === 'RELAY_REJECTED' && /network must be eip155:8453/.test(err.message),
  )
  // … and a matching envelope passes silently.
  assert.doesNotThrow(() => assertRelayEnvelope(decodePaymentHeader(b64(ENVELOPE))!, 'eip155:84532'))
})

test('malformed headers are 400s that say what is wrong', () => {
  expect400(['a', 'b'], /sent once/)
  expect400('%%%not-base64-json', /base64-encoded JSON/)
  expect400(b64('just a string'), /decode to an object/)
  expect400(b64([1, 2]), /decode to an object/)
  expect400(b64({ ...ENVELOPE, x402Version: 2 }), /x402Version 1/)
  expect400(b64({ ...ENVELOPE, scheme: '' }), /name a scheme/)
  expect400(b64({ ...ENVELOPE, network: 7 }), /name a network/)
  expect400(b64({ ...ENVELOPE, payload: 'x' }), /payload object/)
  expect400(b64({ ...ENVELOPE, payload: { signature: '0x', authorization: { ...AUTHORIZATION, nonce: 5 } } }), /authorization\.nonce must be a string/)
  expect400(b64({ ...ENVELOPE, payload: { signature: '0x' } }), /EIP-3009 authorization or a partially signed transaction/)
  expect400(b64({ ...ENVELOPE, payload: { transaction: 42 } }), /EIP-3009 authorization or a partially signed transaction/)
})

test('the settlement header is base64 JSON of exactly the x402 settlement fields', () => {
  const settlement = { success: true as const, transaction: '0xabc', network: 'eip155:84532', payer: `0x${'11'.repeat(20)}` }
  const header = encodeSettlementHeader(settlement)
  assert.deepStrictEqual(JSON.parse(Buffer.from(header, 'base64').toString('utf8')), settlement)
})
