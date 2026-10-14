/**
 * The signer selectors — which of the reader's linked wallets may sign on a
 * given chain (`resolveSignersForChain`), which single one this client
 * DECLARES it will sign with (`declaredSignerFor`), and the settle step that
 * makes that declaration true (`settleSignerFor`). Split out of dispatch.test.ts
 * to keep both files inside the 300-line limit; these are selectors over the
 * auth store, so they need only the mocks that let @/wallet/dispatch load, not
 * the transports themselves.
 */
import type { LinkedWallet } from '@tenda/shared'

// Created INSIDE each factory: jest hoists jest.mock above module-scope consts,
// so an outer reference would still be undefined when the factory first runs.
jest.mock('@solana/web3.js', () => ({
  VersionedTransaction: { deserialize: jest.fn() },
}))
jest.mock('@/wallet/adapters/solana-mwa', () => ({ signAndSendStored: jest.fn() }))
jest.mock('@/wallet/adapters/walletconnect', () => ({ sendEvmTransaction: jest.fn() }))
jest.mock('@/stores/auth.store', () => ({ useAuthStore: { getState: jest.fn() } }))
jest.mock('@/stores/escrow.store', () => ({ useEscrowStore: { getState: jest.fn() } }))
// Partial: the real module, because the namespace lookup this selector depends
// on reads the actual CHAIN_MANIFEST.
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  ensureAllowance: jest.fn(),
}))
jest.mock('@/wallet/ensure-session', () => ({ ensureEvmSession: jest.fn() }))

import { declaredSignerFor, resolveSignersForChain, settleSignerFor } from '@/wallet/dispatch'
import { useAuthStore } from '@/stores/auth.store'
import { ensureEvmSession } from '@/wallet/ensure-session'

const verified = (over: Partial<LinkedWallet> = {}): LinkedWallet => ({
  chain_ns: 'solana',
  address: 'SoLAddr1',
  is_primary: true,
  verified_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

describe('resolveSignersForChain', () => {
  it('answers [] for a chain the manifest does not know — never a guess', () => {
    // The namespace comes from the manifest, NOT from splitting the id on ':'.
    // A split would turn 'eip155:99999' into a plausible-looking namespace and
    // hand the wallet an address for a chain this build cannot sign on.
    //
    // The reader MUST hold an eip155 wallet for this to prove anything: with
    // only a solana wallet the naive split returns [] as well, and the
    // assertion passes while testing nothing. (Caught by mutation, #30.)
    ;(useAuthStore.getState as jest.Mock).mockReturnValue({
      wallets: [verified(), verified({ chain_ns: 'eip155', address: '0xEvm1', is_primary: false })],
    })
    expect(resolveSignersForChain('eip155:99999')).toEqual([])
    expect(resolveSignersForChain('not-a-caip-id')).toEqual([])
  })

  it('offers the verified wallets for the chain’s OWN namespace, and no others', () => {
    ;(useAuthStore.getState as jest.Mock).mockReturnValue({
      wallets: [verified(), verified({ chain_ns: 'eip155', address: '0xEvm1', is_primary: false })],
    })
    const signers = resolveSignersForChain('solana:devnet')
    expect(signers).toContain('SoLAddr1')
    expect(signers).not.toContain('0xEvm1')
  })

  it('offers nothing when the reader has no wallet in that namespace', () => {
    ;(useAuthStore.getState as jest.Mock).mockReturnValue({
      wallets: [verified({ chain_ns: 'eip155', address: '0xEvm1' })],
    })
    expect(resolveSignersForChain('solana:devnet')).toEqual([])
  })
})

describe('declaredSignerFor', () => {
  it('declares the wallet that will sign on the chain’s own namespace', () => {
    ;(useAuthStore.getState as jest.Mock).mockReturnValue({
      wallets: [verified(), verified({ chain_ns: 'eip155', address: '0xEvm1', is_primary: true })],
      evmAddress: null,
      walletAddress: null,
    })
    expect(declaredSignerFor('eip155:84532')).toBe('0xEvm1')
    expect(declaredSignerFor('solana:devnet')).toBe('SoLAddr1')
  })

  it('prefers the live session wallet over the primary — that is the one that signs', () => {
    ;(useAuthStore.getState as jest.Mock).mockReturnValue({
      wallets: [
        verified({ chain_ns: 'eip155', address: '0xPrimary', is_primary: true }),
        verified({ chain_ns: 'eip155', address: '0xConnected', is_primary: false }),
      ],
      evmAddress: '0xConnected',
      walletAddress: null,
    })
    expect(declaredSignerFor('eip155:84532')).toBe('0xConnected')
  })

  it('declares NOTHING rather than guessing, for an unknown chain or an unlinked namespace', () => {
    // Undefined means "server default" — the behaviour that existed before the
    // field. A guess here is baked on chain and cannot be taken back.
    ;(useAuthStore.getState as jest.Mock).mockReturnValue({
      wallets: [verified({ chain_ns: 'eip155', address: '0xEvm1' })],
      evmAddress: null,
      walletAddress: null,
    })
    expect(declaredSignerFor('eip155:99999')).toBeUndefined()
    expect(declaredSignerFor('solana:devnet')).toBeUndefined()
  })
})

describe('settleSignerFor', () => {
  beforeEach(() => (ensureEvmSession as jest.Mock).mockClear())

  it('connects the EVM session first — the slot is empty until it does', async () => {
    await settleSignerFor('eip155:84532')
    expect(ensureEvmSession).toHaveBeenCalledTimes(1)
  })

  it('leaves Solana alone: its slot is persisted and MWA owns its own session', async () => {
    await settleSignerFor('solana:devnet')
    expect(ensureEvmSession).not.toHaveBeenCalled()
  })

  it('does nothing for a chain the manifest does not know', async () => {
    await settleSignerFor('eip155:99999')
    expect(ensureEvmSession).not.toHaveBeenCalled()
  })
})
