import { test } from 'node:test'
import * as assert from 'node:assert'
import { AppError } from '@server/lib/errors'
import {
  AUTH_MESSAGE_MAX_AGE_SECONDS,
  type AuthMessageFields,
  assertAuthMessage,
  parseAuthMessage,
} from '@server/lib/auth-message'

const NOW = new Date('2026-05-20T12:00:00.000Z')

function template(over: Partial<AuthMessageFields> = {}): string {
  const f = {
    address: '0xabc123',
    chain_id: 'solana:devnet',
    nonce: 'A'.repeat(43),
    issued_at: NOW,
    ...over,
  }
  return [
    'Tenda wants you to sign in with your wallet:',
    f.address,
    '',
    `Chain: ${f.chain_id}`,
    'URI: https://api.tenda.test',
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issued_at.toISOString()}`,
  ].join('\n')
}

function expectError(fn: () => void, codeMatch: RegExp): AppError {
  try {
    fn()
  } catch (err) {
    if (!(err instanceof AppError)) throw err
    assert.match(err.message, codeMatch)
    return err
  }
  assert.fail('expected throw')
}

// ---------- parseAuthMessage --------------------------------------------

test('parseAuthMessage: round-trips the canonical template', () => {
  const parsed = parseAuthMessage(template())
  assert.strictEqual(parsed.address, '0xabc123')
  assert.strictEqual(parsed.chain_id, 'solana:devnet')
  assert.strictEqual(parsed.uri, 'https://api.tenda.test')
  assert.strictEqual(parsed.nonce, 'A'.repeat(43))
  assert.strictEqual(parsed.issued_at.toISOString(), NOW.toISOString())
})

test('parseAuthMessage: missing URI → VALIDATION_ERROR', () => {
  const msg = template().replace(/URI:.*\n/, '')
  expectError(() => parseAuthMessage(msg), /missing 'URI:'/)
})

test('parseAuthMessage: missing greeting → VALIDATION_ERROR', () => {
  expectError(() => parseAuthMessage('Chain: solana:devnet\nNonce: x\nIssued At: 2026-01-01T00:00:00Z'), /missing greeting/)
})

test('parseAuthMessage: missing Chain line → VALIDATION_ERROR', () => {
  const msg = template().replace(/Chain:.*\n/, '')
  expectError(() => parseAuthMessage(msg), /missing 'Chain:'/)
})

test('parseAuthMessage: missing Nonce → VALIDATION_ERROR', () => {
  const msg = template().replace(/Nonce:.*\n/, '')
  expectError(() => parseAuthMessage(msg), /missing 'Nonce:'/)
})

test('parseAuthMessage: missing Issued At → VALIDATION_ERROR', () => {
  const msg = template().replace(/Issued At:.*/, '')
  expectError(() => parseAuthMessage(msg), /missing 'Issued At:'/)
})

test('parseAuthMessage: unparseable Issued At → VALIDATION_ERROR', () => {
  const msg = template().replace(NOW.toISOString(), 'not-a-date')
  expectError(() => parseAuthMessage(msg), /unparseable Issued At/)
})

test('parseAuthMessage: empty wallet line → VALIDATION_ERROR', () => {
  const msg = template().replace('0xabc123', '')
  expectError(() => parseAuthMessage(msg), /empty wallet address/)
})

test('parseAuthMessage: tolerates trailing whitespace on fields', () => {
  const msg = template().replace('Nonce: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'Nonce: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA   ')
  const parsed = parseAuthMessage(msg)
  assert.strictEqual(parsed.nonce, 'A'.repeat(43))
})

// ---------- assertAuthMessage -------------------------------------------

function baseAssertArgs() {
  return {
    parsed: {
      address: '0xabc',
      chain_id: 'solana:devnet',
      uri: 'https://api.tenda.test',
      nonce: 'n',
      issued_at: NOW,
    },
    expected_chain_id: 'solana:devnet',
    expected_address: '0xabc',
    now: NOW,
  }
}

test('assertAuthMessage: happy path passes', () => {
  assertAuthMessage(baseAssertArgs())
})

test('assertAuthMessage: wrong chain → VALIDATION_ERROR', () => {
  const args = baseAssertArgs()
  args.parsed.chain_id = 'eip155:8453'
  expectError(() => assertAuthMessage(args), /signed for chain 'eip155:8453'/)
})

test('assertAuthMessage: wrong address → VALIDATION_ERROR', () => {
  const args = baseAssertArgs()
  args.parsed.address = '0xother'
  expectError(() => assertAuthMessage(args), /wallet '0xother' does not match/)
})

test('assertAuthMessage: stale message (> max age) → VALIDATION_ERROR', () => {
  const args = baseAssertArgs()
  args.now = new Date(NOW.getTime() + (AUTH_MESSAGE_MAX_AGE_SECONDS + 5) * 1000)
  expectError(() => assertAuthMessage(args), /age.*outside ±60s window/)
})

test('assertAuthMessage: future-dated message (> max skew) → VALIDATION_ERROR', () => {
  const args = baseAssertArgs()
  args.now = new Date(NOW.getTime() - (AUTH_MESSAGE_MAX_AGE_SECONDS + 5) * 1000)
  expectError(() => assertAuthMessage(args), /age.*outside ±60s window/)
})

test('assertAuthMessage: exactly at the boundary (±60s) is allowed', () => {
  const args = baseAssertArgs()
  args.now = new Date(NOW.getTime() + AUTH_MESSAGE_MAX_AGE_SECONDS * 1000)
  assertAuthMessage(args)
  args.now = new Date(NOW.getTime() - AUTH_MESSAGE_MAX_AGE_SECONDS * 1000)
  assertAuthMessage(args)
})

test('assertAuthMessage: matching expected_uri passes', () => {
  assertAuthMessage({ ...baseAssertArgs(), expected_uri: 'https://api.tenda.test' })
})

test('assertAuthMessage: mismatching expected_uri → VALIDATION_ERROR', () => {
  expectError(
    () =>
      assertAuthMessage({
        ...baseAssertArgs(),
        expected_uri: 'https://other.tenda.test',
      }),
    /URI '.*' does not match expected/,
  )
})

test('assertAuthMessage: expected_uri omitted → URI not asserted (parser already validated presence)', () => {
  assertAuthMessage(baseAssertArgs())
})
