import type { LinkedWallet, MeResponse, MeUser } from '@tenda/shared'

// ApiClientError is defined inside the factory (jest hoists mocks above imports);
// isRetriableMeError's `instanceof` matches because both resolve to this class.
jest.mock('@/api/client', () => {
  // The REAL shared class — sources narrow `instanceof ApiClientError` against it.
  const { ApiClientError } = jest.requireActual('@tenda/shared')
  return { ApiClientError, api: {} }
})

import { reconcileWalletState, isRetriableMeError, type WalletSlice } from '@/stores/wallet-sync'
import { ApiClientError } from '@tenda/shared'

const EVM = '0xAbC0000000000000000000000000000000000001'
const SOL = 'So1anaAddr11111111111111111111111111111111'

function wallet(chain_ns: 'eip155' | 'solana', address: string, verified = true): LinkedWallet {
  return { chain_ns, address, is_primary: true, verified_at: verified ? '2026-01-01T00:00:00Z' : null }
}

function me(wallets: LinkedWallet[]): MeResponse {
  return { user: {} as MeUser, wallets, profile_complete: true }
}

/** The store slice the reconcile folds into, with sensible empties. */
function slice(over: Partial<WalletSlice> = {}): WalletSlice {
  return { wallets: [], walletAddress: null, evmAddress: null, ...over }
}

describe('reconcileWalletState', () => {
  test('adopts the fresh wallets[] and profile flag', () => {
    const out = reconcileWalletState(slice(), me([wallet('eip155', EVM)]))
    expect(out.wallets).toHaveLength(1)
    expect(out.profileComplete).toBe(true)
  })

  test('keeps a session address slot when it is still a verified linked wallet', () => {
    const out = reconcileWalletState(
      slice({ walletAddress: SOL, evmAddress: EVM }),
      me([wallet('eip155', EVM), wallet('solana', SOL)]),
    )
    expect(out.evmAddress).toBe(EVM)
    expect(out.walletAddress).toBe(SOL)
  })

  test('drops a session address that is no longer a linked wallet', () => {
    const out = reconcileWalletState(slice({ walletAddress: SOL, evmAddress: EVM }), me([]))
    expect(out.evmAddress).toBeNull()
    expect(out.walletAddress).toBeNull()
  })

  test('drops a session address whose linked wallet is unverified', () => {
    const out = reconcileWalletState(
      slice({ walletAddress: null, evmAddress: EVM }),
      me([wallet('eip155', EVM, false)]),
    )
    expect(out.evmAddress).toBeNull()
  })

  // ── array identity ─────────────────────────────────────────────────────────
  // Consumers key effects and memos off `wallets`. refreshMe runs on every
  // wallet-screen focus, so a fresh array per response would re-read every
  // balance over RPC on a list that never moved.

  test('keeps the SAME array when the list is unchanged', () => {
    const current = [wallet('eip155', EVM), wallet('solana', SOL)]
    // A distinct but content-equal response, exactly as the wire delivers it.
    const fresh = [wallet('eip155', EVM), wallet('solana', SOL)]

    const out = reconcileWalletState(slice({ wallets: current }), me(fresh))

    expect(out.wallets).toBe(current)
  })

  test('ignores row ORDER, which the server never promised', () => {
    const current = [wallet('eip155', EVM), wallet('solana', SOL)]
    const reordered = [wallet('solana', SOL), wallet('eip155', EVM)]

    const out = reconcileWalletState(slice({ wallets: current }), me(reordered))

    expect(out.wallets).toBe(current)
  })

  test('adopts the fresh array when a wallet is ADDED', () => {
    const current = [wallet('eip155', EVM)]
    const fresh = [wallet('eip155', EVM), wallet('solana', SOL)]

    const out = reconcileWalletState(slice({ wallets: current }), me(fresh))

    expect(out.wallets).not.toBe(current)
    expect(out.wallets).toHaveLength(2)
  })

  test('adopts the fresh array when a wallet is REMOVED', () => {
    const current = [wallet('eip155', EVM), wallet('solana', SOL)]

    const out = reconcileWalletState(slice({ wallets: current }), me([wallet('eip155', EVM)]))

    expect(out.wallets).toHaveLength(1)
  })

  test('adopts the fresh array when only a FIELD changed (primary, verification)', () => {
    // Same addresses, different meaning — identity must move or the screens
    // would keep rendering the old primary/unverified state.
    const current = [{ ...wallet('eip155', EVM), is_primary: false }]
    const fresh = [{ ...wallet('eip155', EVM), is_primary: true }]

    const out = reconcileWalletState(slice({ wallets: current }), me(fresh))

    expect(out.wallets).toBe(fresh)

    const nowVerified = reconcileWalletState(
      slice({ wallets: [wallet('eip155', EVM, false)] }),
      me([wallet('eip155', EVM, true)]),
    )
    expect(nowVerified.wallets[0].verified_at).not.toBeNull()
  })

  test('an empty list stays the same empty array', () => {
    const current: LinkedWallet[] = []

    const out = reconcileWalletState(slice({ wallets: current }), me([]))

    expect(out.wallets).toBe(current)
  })

  test('matches EVM addresses case-insensitively', () => {
    const out = reconcileWalletState(
      slice({ walletAddress: null, evmAddress: EVM.toLowerCase() }),
      me([wallet('eip155', EVM.toUpperCase())]),
    )
    expect(out.evmAddress).toBe(EVM.toLowerCase())
  })
})

describe('isRetriableMeError', () => {
  test('does NOT retry a terminal auth failure (401/403)', () => {
    expect(isRetriableMeError(new ApiClientError(401, 'Unauthorized', 'no'))).toBe(false)
    expect(isRetriableMeError(new ApiClientError(403, 'Forbidden', 'no'))).toBe(false)
  })

  test('retries a transient server/transport failure', () => {
    expect(isRetriableMeError(new ApiClientError(500, 'Server', 'boom'))).toBe(true)
    expect(isRetriableMeError(new ApiClientError(0, 'Network', 'down'))).toBe(true)
  })

  test('retries a non-ApiClientError (network) error', () => {
    expect(isRetriableMeError(new Error('Network request failed'))).toBe(true)
  })
})
