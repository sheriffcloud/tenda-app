/**
 * connectAsWallet / ensureSignerSession — the signer-contract guard: the
 * session must be ONE SPECIFIC wallet (the tx's baked/bound signer), and
 * every failure path names it. Kept beside session.test.ts (300-line split);
 * same fakes, trimmed to what the targeted guard touches.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletError, type ChainNamespace, type LinkedWallet } from '@tenda/shared'

interface FakeModal {
  getAddress: (ns: ChainNamespace) => string | undefined
  disconnect: ReturnType<typeof vi.fn>
}

function fakeModal(addresses: Partial<Record<ChainNamespace, string>> = {}): FakeModal {
  return {
    getAddress: (ns) => addresses[ns],
    disconnect: vi.fn(async () => {}),
  }
}

const runtimeState = { current: null as { modal: FakeModal } | null }
vi.mock('@/wallet/runtime', () => ({
  loadWalletRuntime: async () =>
    runtimeState.current === null ? { status: 'disabled' } : { status: 'ready', runtime: runtimeState.current },
  peekWalletRuntime: () => runtimeState.current,
}))

const waitForConnectionMock = vi.fn()
const settledMock = vi.fn()
vi.mock('@/wallet/adapters/reown-connect', () => ({
  waitForConnection: (modal: unknown, opts?: unknown) => waitForConnectionMock(modal, opts),
  settledConnectedAccount: (modal: unknown, ns?: unknown) => settledMock(modal, ns),
}))

const authState = {
  wallets: [] as LinkedWallet[],
  walletsStatus: 'ready' as 'idle' | 'loading' | 'ready' | 'error',
  ensureWallets: vi.fn(async () => {}),
}
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: () => authState },
}))

import { connectAsWallet, ensureSignerSession } from '@/wallet/send/session'

function linked(ns: ChainNamespace, address: string): LinkedWallet {
  return { chain_ns: ns, address, is_primary: true, verified_at: '2026-01-01T00:00:00Z' }
}

function boot(modal: FakeModal): void {
  runtimeState.current = { modal }
}

beforeEach(() => {
  runtimeState.current = null
  authState.wallets = []
  authState.walletsStatus = 'ready'
  waitForConnectionMock.mockReset()
  settledMock.mockReset()
  settledMock.mockResolvedValue(null)
})

describe('connectAsWallet', () => {
  it('a live session that IS the required wallet passes untouched — no picker, no teardown', async () => {
    authState.wallets = [linked('solana', 'SoLBound')]
    const modal = fakeModal({ solana: 'SoLBound' })
    boot(modal)
    await expect(connectAsWallet('solana', 'SoLBound')).resolves.toBe('SoLBound')
    expect(modal.disconnect).not.toHaveBeenCalled()
    expect(waitForConnectionMock).not.toHaveBeenCalled()
  })

  it('EVM match is checksum-agnostic; Solana stays case-exact', async () => {
    authState.wallets = [linked('eip155', '0xAbCd'), linked('solana', 'SoLBound')]
    boot(fakeModal({ eip155: '0xABCD' }))
    await expect(connectAsWallet('eip155', '0xabcd')).resolves.toBe('0xABCD')

    // Solana base58 differs by case → NOT the same wallet: fresh pick opens.
    const modal = fakeModal({ solana: 'solbound' })
    boot(modal)
    waitForConnectionMock.mockResolvedValue({ address: 'SoLBound' })
    await expect(connectAsWallet('solana', 'SoLBound')).resolves.toBe('SoLBound')
    expect(modal.disconnect).toHaveBeenCalledWith('solana')
  })

  it('a different live session drops ONLY this namespace and demands a fresh pick', async () => {
    authState.wallets = [linked('eip155', '0xBound'), linked('eip155', '0xOther')]
    const modal = fakeModal({ eip155: '0xOther' })
    boot(modal)
    waitForConnectionMock.mockResolvedValue({ address: '0xBound' })
    await expect(connectAsWallet('eip155', '0xBound')).resolves.toBe('0xBound')
    expect(modal.disconnect).toHaveBeenCalledWith('eip155')
    expect(waitForConnectionMock).toHaveBeenCalledWith(modal, { namespace: 'eip155', fresh: true })
  })

  it('picking any OTHER wallet is refused naming the required one', async () => {
    authState.wallets = [linked('eip155', '0xBoundWallet1234'), linked('eip155', '0xPicked')]
    boot(fakeModal())
    waitForConnectionMock.mockResolvedValue({ address: '0xPicked' })
    await expect(connectAsWallet('eip155', '0xBoundWallet1234')).rejects.toMatchObject({
      code: 'no_wallet',
      message: expect.stringContaining('0xBo…1234'),
    })
  })

  it('dismissing the picker still names the wallet the escrow needs', async () => {
    authState.wallets = [linked('eip155', '0xBoundWallet1234')]
    boot(fakeModal())
    waitForConnectionMock.mockRejectedValue(new WalletError('declined', 'closed'))
    await expect(connectAsWallet('eip155', '0xBoundWallet1234')).rejects.toMatchObject({
      code: 'no_wallet',
      message: expect.stringContaining('the wallet this escrow is signed by'),
    })
  })

  it('a non-declined connect failure (timeout, relay error) propagates UNCONVERTED', async () => {
    // Only a dismissal is rewritten into the named-wallet message; converting
    // a timeout too would hide the real failure from the guard exits.
    authState.wallets = [linked('eip155', '0xBound')]
    boot(fakeModal())
    waitForConnectionMock.mockRejectedValue(new WalletError('timeout', 'Wallet did not respond'))
    await expect(connectAsWallet('eip155', '0xBound')).rejects.toMatchObject({
      code: 'timeout',
      message: 'Wallet did not respond',
    })
  })

  it('a bound wallet the user UNLINKED is refused with the re-link instruction, picker never opens', async () => {
    authState.wallets = [linked('eip155', '0xSomethingElse')]
    const modal = fakeModal({ eip155: '0xSomethingElse' })
    boot(modal)
    await expect(connectAsWallet('eip155', '0xBoundWallet1234')).rejects.toMatchObject({
      code: 'no_wallet',
      message: expect.stringContaining('re-link it in Settings'),
    })
    expect(modal.disconnect).not.toHaveBeenCalled()
    expect(waitForConnectionMock).not.toHaveBeenCalled()
  })

  it('a lazily-RESTORING session is settled before being judged', async () => {
    // getAddress answers nothing while the adapter restores; tearing that
    // down would discard a session that was about to be the right wallet.
    authState.wallets = [linked('solana', 'SoLBound')]
    const modal = fakeModal()
    boot(modal)
    settledMock.mockResolvedValue({ address: 'SoLBound' })
    await expect(connectAsWallet('solana', 'SoLBound')).resolves.toBe('SoLBound')
    expect(modal.disconnect).not.toHaveBeenCalled()
  })
})

describe('ensureSignerSession', () => {
  it('with a required signer it IS the targeted guard; without one, any linked session passes', async () => {
    authState.wallets = [linked('eip155', '0xBound'), linked('eip155', '0xOther')]
    boot(fakeModal({ eip155: '0xOther' }))
    waitForConnectionMock.mockResolvedValue({ address: '0xBound' })
    await expect(ensureSignerSession('eip155', '0xBound')).resolves.toBe('0xBound')

    // No requirement → the live linked session is good enough (legacy path).
    boot(fakeModal({ eip155: '0xOther' }))
    waitForConnectionMock.mockReset()
    await expect(ensureSignerSession('eip155')).resolves.toBe('0xOther')
    expect(waitForConnectionMock).not.toHaveBeenCalled()
  })
})
