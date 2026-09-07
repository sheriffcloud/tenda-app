/**
 * pickWalletAddress / isLinkedWallet — wallets[] is the single source of trust.
 * Covers: corroborated session preferred, stale/unlinked session ignored,
 * primary-first fallback, unverified excluded, EVM case-insensitivity, and the
 * no-wallet null case.
 */
import type { LinkedWallet } from '@tenda/shared'
import { pickWalletAddress, isLinkedWallet, orderedSignerAddresses } from '../wallet-address'

function w(over: Partial<LinkedWallet>): LinkedWallet {
  return {
    chain_ns: 'eip155',
    address: '0xLinked',
    is_primary: false,
    verified_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('pickWalletAddress', () => {
  test('returns null when there is no verified wallet on the namespace', () => {
    expect(pickWalletAddress('eip155', null, [])).toBeNull()
    expect(pickWalletAddress('eip155', '0xLive', [])).toBeNull()
  })

  test('resolves a verified linked wallet with no session (the bug: eligibility from wallets[])', () => {
    const wallets = [w({ address: '0xLinked', is_primary: true })]
    expect(pickWalletAddress('eip155', null, wallets)).toBe('0xLinked')
  })

  test('prefers the session address when it is a verified linked wallet', () => {
    const wallets = [w({ address: '0xLive' }), w({ address: '0xOther', is_primary: true })]
    expect(pickWalletAddress('eip155', '0xLive', wallets)).toBe('0xLive')
  })

  test('ignores a stale/unlinked session address and falls back to the primary', () => {
    const wallets = [w({ address: '0xPrimary', is_primary: true }), w({ address: '0xSecondary' })]
    expect(pickWalletAddress('eip155', '0xStale', wallets)).toBe('0xPrimary')
  })

  test('falls back to the first verified wallet when none is primary', () => {
    const wallets = [w({ address: '0xFirst' }), w({ address: '0xSecond' })]
    expect(pickWalletAddress('eip155', null, wallets)).toBe('0xFirst')
  })

  test('excludes unverified wallets from both the session check and the fallback', () => {
    const wallets = [w({ address: '0xUnverified', verified_at: null })]
    expect(pickWalletAddress('eip155', '0xUnverified', wallets)).toBeNull()
  })

  test('matches EVM addresses case-insensitively (checksum-agnostic)', () => {
    const wallets = [w({ address: '0xABCDEF', is_primary: true })]
    expect(pickWalletAddress('eip155', '0xabcdef', wallets)).toBe('0xabcdef')
  })

  test('is namespace-scoped: an EVM wallet does not satisfy a solana lookup', () => {
    const wallets = [w({ address: '0xLinked', is_primary: true })]
    expect(pickWalletAddress('solana', null, wallets)).toBeNull()
  })

  test('solana addresses are matched case-sensitively', () => {
    const wallets = [w({ chain_ns: 'solana', address: 'SoLAddr', is_primary: true })]
    expect(pickWalletAddress('solana', 'soladdr', wallets)).toBe('SoLAddr') // falls back, no case-fold
    expect(pickWalletAddress('solana', 'SoLAddr', wallets)).toBe('SoLAddr')
  })
})

describe('isLinkedWallet', () => {
  test('true only for a verified wallet on the namespace', () => {
    const wallets = [w({ address: '0xLinked' }), w({ chain_ns: 'solana', address: 'SoL' })]
    expect(isLinkedWallet('eip155', '0xLINKED', wallets)).toBe(true)
    expect(isLinkedWallet('eip155', '0xNope', wallets)).toBe(false)
    expect(isLinkedWallet('solana', 'SoL', wallets)).toBe(true)
  })
})

// --- orderedSignerAddresses: the candidate set a balance check reasons over ---

describe('orderedSignerAddresses', () => {
  const primary = { chain_ns: 'eip155', address: '0xPRIMARY', verified_at: '2026-01-01', is_primary: true } as LinkedWallet
  const second = { chain_ns: 'eip155', address: '0xSECOND', verified_at: '2026-01-01', is_primary: false } as LinkedWallet
  const unverified = { chain_ns: 'eip155', address: '0xUNVERIFIED', verified_at: null, is_primary: false } as LinkedWallet
  const solana = { chain_ns: 'solana', address: 'SoL1', verified_at: '2026-01-01', is_primary: true } as LinkedWallet

  test('returns every verified wallet on the namespace', () => {
    expect(orderedSignerAddresses('eip155', null, [primary, second])).toEqual(['0xPRIMARY', '0xSECOND'])
  })

  test('the head is exactly pickWalletAddress — the two can never disagree', () => {
    const wallets = [primary, second]
    for (const session of [null, '0xSECOND', '0xunknown']) {
      const head = orderedSignerAddresses('eip155', session, wallets)[0]
      expect(head).toBe(pickWalletAddress('eip155', session, wallets))
    }
  })

  test('a corroborated session wallet leads, and is not duplicated', () => {
    const out = orderedSignerAddresses('eip155', '0xSECOND', [primary, second])
    expect(out).toEqual(['0xSECOND', '0xPRIMARY'])
  })

  test('a session address differing only in case is not duplicated (EVM checksum)', () => {
    const out = orderedSignerAddresses('eip155', '0xprimary', [primary, second])
    expect(out).toEqual(['0xprimary', '0xSECOND'])
  })

  test('unverified wallets are excluded — they cannot sign for this account', () => {
    expect(orderedSignerAddresses('eip155', null, [primary, unverified])).toEqual(['0xPRIMARY'])
  })

  test('other namespaces are excluded', () => {
    expect(orderedSignerAddresses('eip155', null, [primary, solana])).toEqual(['0xPRIMARY'])
  })

  test('no verified wallet on the namespace yields an empty set', () => {
    expect(orderedSignerAddresses('eip155', null, [solana, unverified])).toEqual([])
  })
})
