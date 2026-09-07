/**
 * Round-trip contract between the shared auth-message BUILDER (mobile uses
 * it to construct what the wallet signs) and the server-side PARSER. If
 * either side's template drifts, this fails before any device does.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { buildAuthMessage } from '@tenda/shared'
import { parseAuthMessage } from '@server/lib/auth-message'

const INPUT = {
  address: '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1',
  chain_id: 'solana:devnet',
  uri: 'https://api.tenda.test',
  nonce: 'n0nc3-base64url',
  issued_at: new Date('2026-06-04T12:00:00.000Z'),
}

test('buildAuthMessage output parses back to identical fields', () => {
  const message = buildAuthMessage(INPUT)
  const parsed = parseAuthMessage(message)
  assert.strictEqual(parsed.address, INPUT.address)
  assert.strictEqual(parsed.chain_id, INPUT.chain_id)
  assert.strictEqual(parsed.uri, INPUT.uri)
  assert.strictEqual(parsed.nonce, INPUT.nonce)
  assert.strictEqual(parsed.issued_at.toISOString(), INPUT.issued_at.toISOString())
})

test('round-trips an EVM-shaped address and chain too', () => {
  const message = buildAuthMessage({
    ...INPUT,
    address: '0x52908400098527886E0F7030069857D2E4169EE7',
    chain_id: 'eip155:8453',
  })
  const parsed = parseAuthMessage(message)
  assert.strictEqual(parsed.address, '0x52908400098527886E0F7030069857D2E4169EE7')
  assert.strictEqual(parsed.chain_id, 'eip155:8453')
})

test('issued_at defaults to now when omitted', () => {
  const before = Date.now()
  const parsed = parseAuthMessage(
    buildAuthMessage({ ...INPUT, issued_at: undefined }),
  )
  assert.ok(parsed.issued_at.getTime() >= before - 1000)
  assert.ok(parsed.issued_at.getTime() <= Date.now() + 1000)
})
