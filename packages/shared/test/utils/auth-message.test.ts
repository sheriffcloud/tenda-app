import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAuthMessage } from '../../src/utils/auth-message'

const BASE_INPUT = {
  address: '9xQpFv7c1mWq8s2RpKf3hYz',
  chain_id: 'solana:mainnet',
  uri: 'https://api.tenda.app',
  nonce: 'abc123',
  issued_at: new Date('2026-06-14T12:00:00.000Z'),
}

test('buildAuthMessage: produces the exact canonical multi-line template', () => {
  const msg = buildAuthMessage(BASE_INPUT)
  assert.equal(
    msg,
    [
      'Tenda wants you to sign in with your wallet:',
      '9xQpFv7c1mWq8s2RpKf3hYz',
      '',
      'Chain: solana:mainnet',
      'URI: https://api.tenda.app',
      'Nonce: abc123',
      'Issued At: 2026-06-14T12:00:00.000Z',
    ].join('\n'),
  )
})

test('buildAuthMessage: injected issued_at is rendered as ISO-8601', () => {
  const msg = buildAuthMessage(BASE_INPUT)
  assert.match(msg, /Issued At: 2026-06-14T12:00:00\.000Z$/)
})

test('buildAuthMessage: defaults issued_at to now when omitted', () => {
  const before = Date.now()
  const msg = buildAuthMessage({ ...BASE_INPUT, issued_at: undefined })
  const after = Date.now()
  const stamp = msg.split('Issued At: ')[1]
  const parsed = new Date(stamp).getTime()
  assert.ok(parsed >= before && parsed <= after, 'issued_at should fall within the call window')
})

test('buildAuthMessage: EVM chain id and 0x address round-trip into the template', () => {
  const msg = buildAuthMessage({
    ...BASE_INPUT,
    address: '0x1234567890abcdef1234567890abcdef12345678',
    chain_id: 'eip155:8453',
  })
  assert.match(msg, /^Tenda wants you to sign in with your wallet:\n0x1234567890abcdef1234567890abcdef12345678\n/)
  assert.match(msg, /Chain: eip155:8453/)
})
