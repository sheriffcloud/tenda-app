/**
 * classifyConnectError — the one copy table for wallet connect failures.
 * Covers every WalletError branch, the API 401/403 branch, the message
 * heuristics, the dev-detail seam, and the per-platform no_wallet override.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { classifyConnectError, WalletError } from '../../src/wallet'
import { ApiClientError } from '../../src/api/client-error'
import { APP_INFO } from '../../src/constants/app-info'

test('no_wallet defaults to the install-a-wallet copy with the Phantom store link', () => {
  const copy = classifyConnectError(new WalletError('no_wallet', 'x'))
  assert.strictEqual(copy.title, 'No wallet found')
  assert.strictEqual(copy.secondaryLabel, 'Get Phantom')
  assert.strictEqual(copy.secondaryUrl, APP_INFO.wallets.phantom.playStore)
})

test('no_wallet honors the per-platform override (web: not configured ≠ not installed)', () => {
  const override = { title: 'Wallet connect unavailable', description: 'Not configured for this build.' }
  assert.deepStrictEqual(
    classifyConnectError(new WalletError('no_wallet', 'x'), { noWalletCopy: override }),
    override,
  )
})

test('declined, network and unknown WalletError codes map to their copy', () => {
  assert.strictEqual(classifyConnectError(new WalletError('declined', 'x')).title, 'Connection cancelled')
  assert.strictEqual(classifyConnectError(new WalletError('network', 'x')).title, 'No connection')
  assert.strictEqual(classifyConnectError(new WalletError('unknown', 'x')).title, 'Something went wrong')
  assert.strictEqual(classifyConnectError(new WalletError('timeout', 'x')).title, 'Something went wrong')
})

test('an unverifiable wallet (API 401/403) reads as sign-in failed', () => {
  assert.strictEqual(
    classifyConnectError(new ApiClientError(401, 'Unauthorized', 'bad sig')).title,
    'Sign-in failed',
  )
  assert.strictEqual(
    classifyConnectError(new ApiClientError(403, 'Forbidden', 'nope')).title,
    'Sign-in failed',
  )
})

test('other API errors fall through to the message heuristics, not sign-in failed', () => {
  const copy = classifyConnectError(new ApiClientError(500, 'Internal', 'server exploded'))
  assert.strictEqual(copy.title, 'Something went wrong')
})

test('plain-Error network/fetch/timeout messages read as connectivity', () => {
  for (const msg of ['Network request failed', 'fetch failed', 'Timeout exceeded']) {
    assert.strictEqual(classifyConnectError(new Error(msg)).title, 'No connection')
  }
})

test('devDetail surfaces the raw message; production copy stays generic', () => {
  const err = new Error('weird provider state')
  assert.match(classifyConnectError(err, { devDetail: true }).description, /weird provider state/)
  assert.strictEqual(
    classifyConnectError(err).description,
    'An unexpected error occurred. Please try again.',
  )
  assert.match(classifyConnectError('str-error', { devDetail: true }).description, /str-error/)
})
