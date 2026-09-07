/**
 * pickWalletAddress / isLinkedWallet — wallets[] is the single source of trust.
 * Covers: corroborated session preferred, stale/unlinked session ignored,
 * primary-first fallback, unverified excluded, EVM case-insensitivity, and the
 * no-wallet null case.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import type { LinkedWallet } from '../../src/api/contracts/auth.contract'
import {
  pickWalletAddress,
  isLinkedWallet,
  orderedSignerAddresses,
  preferredWalletAddress,
  verifiedWalletsOn,
} from '../../src/wallet/wallet-address'

function w(over: Partial<LinkedWallet>): LinkedWallet {
  return {
    chain_ns: 'eip155',
    address: '0xLinked',
    is_primary: false,
    verified_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

test('pickWalletAddress returns null when there is no verified wallet on the namespace', () => {
  assert.strictEqual(pickWalletAddress('eip155', null, []), null)
  assert.strictEqual(pickWalletAddress('eip155', '0xLive', []), null)
})

test('resolves a verified linked wallet with no session (the bug: eligibility from wallets[])', () => {
  const wallets = [w({ address: '0xLinked', is_primary: true })]
  assert.strictEqual(pickWalletAddress('eip155', null, wallets), '0xLinked')
})

test('prefers the session address when it is a verified linked wallet', () => {
  const wallets = [w({ address: '0xLive' }), w({ address: '0xOther', is_primary: true })]
  assert.strictEqual(pickWalletAddress('eip155', '0xLive', wallets), '0xLive')
})

test('ignores a stale/unlinked session address and falls back to the primary', () => {
  const wallets = [w({ address: '0xPrimary', is_primary: true }), w({ address: '0xSecondary' })]
  assert.strictEqual(pickWalletAddress('eip155', '0xStale', wallets), '0xPrimary')
})

test('falls back to the first verified wallet when none is primary', () => {
  const wallets = [w({ address: '0xFirst' }), w({ address: '0xSecond' })]
  assert.strictEqual(pickWalletAddress('eip155', null, wallets), '0xFirst')
})

test('excludes unverified wallets from both the session check and the fallback', () => {
  const wallets = [w({ address: '0xUnverified', verified_at: null })]
  assert.strictEqual(pickWalletAddress('eip155', '0xUnverified', wallets), null)
})

test('matches EVM addresses case-insensitively (checksum-agnostic)', () => {
  const wallets = [w({ address: '0xABCDEF', is_primary: true })]
  assert.strictEqual(pickWalletAddress('eip155', '0xabcdef', wallets), '0xabcdef')
})

test('is namespace-scoped: an EVM wallet does not satisfy a solana lookup', () => {
  const wallets = [w({ address: '0xLinked', is_primary: true })]
  assert.strictEqual(pickWalletAddress('solana', null, wallets), null)
})

test('solana addresses are matched case-sensitively', () => {
  const wallets = [w({ chain_ns: 'solana', address: 'SoLAddr', is_primary: true })]
  assert.strictEqual(pickWalletAddress('solana', 'soladdr', wallets), 'SoLAddr') // falls back, no case-fold
  assert.strictEqual(pickWalletAddress('solana', 'SoLAddr', wallets), 'SoLAddr')
})

test('isLinkedWallet is true only for a verified wallet on the namespace', () => {
  const wallets = [w({ address: '0xLinked' }), w({ chain_ns: 'solana', address: 'SoL' })]
  assert.strictEqual(isLinkedWallet('eip155', '0xLINKED', wallets), true)
  assert.strictEqual(isLinkedWallet('eip155', '0xNope', wallets), false)
  assert.strictEqual(isLinkedWallet('solana', 'SoL', wallets), true)
})

// --- orderedSignerAddresses: the candidate set a balance check reasons over ---

const primary = w({ address: '0xPRIMARY', is_primary: true })
const second = w({ address: '0xSECOND' })
const unverified = w({ address: '0xUNVERIFIED', verified_at: null })
const solana = w({ chain_ns: 'solana', address: 'SoL1', is_primary: true })

test('returns every verified wallet on the namespace', () => {
  assert.deepStrictEqual(orderedSignerAddresses('eip155', null, [primary, second]), ['0xPRIMARY', '0xSECOND'])
})

test('the head is exactly pickWalletAddress — the two can never disagree', () => {
  const wallets = [primary, second]
  for (const session of [null, '0xSECOND', '0xunknown']) {
    const head = orderedSignerAddresses('eip155', session, wallets)[0]
    assert.strictEqual(head, pickWalletAddress('eip155', session, wallets))
  }
})

test('a corroborated session wallet leads, and is not duplicated', () => {
  assert.deepStrictEqual(orderedSignerAddresses('eip155', '0xSECOND', [primary, second]), ['0xSECOND', '0xPRIMARY'])
})

test('a session address differing only in case is not duplicated (EVM checksum)', () => {
  assert.deepStrictEqual(orderedSignerAddresses('eip155', '0xprimary', [primary, second]), ['0xprimary', '0xSECOND'])
})

test('unverified wallets are excluded — they cannot sign for this account', () => {
  assert.deepStrictEqual(orderedSignerAddresses('eip155', null, [primary, unverified]), ['0xPRIMARY'])
})

test('other namespaces are excluded', () => {
  assert.deepStrictEqual(orderedSignerAddresses('eip155', null, [primary, solana]), ['0xPRIMARY'])
})

test('no verified wallet on the namespace yields an empty set', () => {
  assert.deepStrictEqual(orderedSignerAddresses('eip155', null, [solana, unverified]), [])
})

// ── verifiedWalletsOn / preferredWalletAddress (the chooser side) ────────────

test('verifiedWalletsOn keeps only the namespace it was asked for', () => {
  const wallets = [w({ address: '0xEvm' }), w({ chain_ns: 'solana', address: 'Sol1' })]
  assert.deepStrictEqual(
    verifiedWalletsOn('solana', wallets).map((x) => x.address),
    ['Sol1'],
  )
})

test('verifiedWalletsOn drops an unverified wallet — an option list is a trust list', () => {
  const wallets = [w({ address: '0xPending', verified_at: null }), w({ address: '0xGood' })]
  assert.deepStrictEqual(
    verifiedWalletsOn('eip155', wallets).map((x) => x.address),
    ['0xGood'],
  )
})

test('preferredWalletAddress keeps a remembered choice that is still linked', () => {
  const wallets = [w({ address: '0xPrimary', is_primary: true }), w({ address: '0xChosen' })]
  assert.strictEqual(preferredWalletAddress('eip155', '0xChosen', wallets), '0xChosen')
})

test('preferredWalletAddress answers with the ROW spelling, not the caller\'s', () => {
  // The picker compares its selection against the rows it renders, so echoing
  // a differently-cased EVM address back would leave every row unselected.
  const wallets = [w({ address: '0xAbCdEf' })]
  assert.strictEqual(preferredWalletAddress('eip155', '0xabcdef', wallets), '0xAbCdEf')
})

test('preferredWalletAddress falls back to the primary once the remembered wallet is unlinked', () => {
  const wallets = [w({ address: '0xFirst' }), w({ address: '0xPrimary', is_primary: true })]
  assert.strictEqual(preferredWalletAddress('eip155', '0xGone', wallets), '0xPrimary')
})

test('preferredWalletAddress falls back to the first when none is primary, and to null with none at all', () => {
  const wallets = [w({ address: '0xFirst' }), w({ address: '0xSecond' })]
  assert.strictEqual(preferredWalletAddress('eip155', null, wallets), '0xFirst')
  assert.strictEqual(preferredWalletAddress('eip155', null, []), null)
  assert.strictEqual(preferredWalletAddress('eip155', '0xAnything', []), null)
})

test('preferredWalletAddress will not offer an unverified wallet even when it is the remembered one', () => {
  const wallets = [w({ address: '0xRemembered', verified_at: null }), w({ address: '0xGood' })]
  assert.strictEqual(preferredWalletAddress('eip155', '0xRemembered', wallets), '0xGood')
})
