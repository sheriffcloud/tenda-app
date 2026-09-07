/**
 * The live web adapter over a mocked runtime. connectThenSign is the REAL
 * shared composer (never mocked — instanceof narrowing must run against the
 * real WalletError), so `authenticate` decline paths are integration-tested.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChainNamespace } from '@tenda/shared'

interface FakeModal {
  getAddress: (ns: ChainNamespace) => string | undefined
  getAccount: (ns: ChainNamespace) => { status?: 'disconnected' } | undefined
  getCaipNetwork: (ns: ChainNamespace) => { caipNetworkId?: string } | undefined
  subscribeAccount: ReturnType<typeof vi.fn>
  subscribeState: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  getProvider: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

function fakeModal(addresses: Partial<Record<ChainNamespace, string>> = {}): FakeModal {
  return {
    getAddress: (ns) => addresses[ns],
    // Settled: connect() must fall through to the modal without waiting on
    // the restore budget (the restore-in-flight path is unit-tested where
    // settledConnectedAccount lives).
    getAccount: () => ({ status: 'disconnected' }),
    getCaipNetwork: () => undefined,
    subscribeAccount: vi.fn(() => () => {}),
    subscribeState: vi.fn(() => () => {}),
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    getProvider: vi.fn(() => undefined),
    disconnect: vi.fn(async () => {}),
  }
}

const runtimeState = { current: null as { modal: FakeModal } | null, peek: null as { modal: FakeModal } | null }
vi.mock('@/wallet/runtime', () => ({
  loadWalletRuntime: async () =>
    runtimeState.current === null ? { status: 'disabled' } : { status: 'ready', runtime: runtimeState.current },
  peekWalletRuntime: () => runtimeState.peek,
  walletConfigured: () => runtimeState.current !== null,
}))

import { reownAdapter } from '@/wallet/adapters/reown'

beforeEach(() => {
  runtimeState.current = null
  runtimeState.peek = null
})

function boot(modal: FakeModal): void {
  runtimeState.current = { modal }
  runtimeState.peek = { modal }
}

describe('availability + connect', () => {
  it('is unavailable and refuses to connect when Reown is not configured', async () => {
    await expect(reownAdapter.isAvailable()).resolves.toBe(false)
    await expect(reownAdapter.connect()).rejects.toMatchObject({ name: 'WalletError', code: 'no_wallet' })
  })

  it('reuses a live session without opening the modal; fresh forces the modal', async () => {
    const modal = fakeModal({ solana: 'SoL1' })
    boot(modal)
    await expect(reownAdapter.connect()).resolves.toMatchObject({ address: 'SoL1', walletId: 'reown' })
    expect(modal.open).not.toHaveBeenCalled()

    // fresh: the wait path opens the modal (we don't settle it here).
    void reownAdapter.connect({ fresh: true }).catch(() => {})
    await vi.waitFor(() => expect(modal.open).toHaveBeenCalledTimes(1))
  })
})

describe('signMessage', () => {
  it('EVM: personal_sign with the hex-encoded message and address; hex is real UTF-8', async () => {
    const request = vi.fn(async () => '0xsig')
    const modal = fakeModal({ eip155: '0xabc' })
    modal.getProvider = vi.fn((ns: ChainNamespace) => (ns === 'eip155' ? { request } : undefined))
    boot(modal)

    const account = { namespace: 'eip155' as const, chainId: 'eip155:84532', address: '0xabc', walletId: 'reown' }
    await expect(reownAdapter.signMessage(account, 'Hi')).resolves.toEqual({ signature: '0xsig', message: 'Hi' })
    expect(request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: ['0x4869', '0xabc'], // 'Hi' = 0x48 0x69
    })
  })

  it('Solana: signs the UTF-8 bytes and returns base64', async () => {
    const signMessage = vi.fn(async (bytes: Uint8Array) => bytes.slice(0, 2))
    const modal = fakeModal({ solana: 'SoL1' })
    modal.getProvider = vi.fn((ns: ChainNamespace) => (ns === 'solana' ? { signMessage } : undefined))
    boot(modal)

    const account = { namespace: 'solana' as const, chainId: 'solana:devnet', address: 'SoL1', walletId: 'reown' }
    const result = await reownAdapter.signMessage(account, 'Hi')
    expect(result.signature).toBe(btoa('Hi')) // signature bytes 'Hi' → base64
    expect(signMessage).toHaveBeenCalledWith(new TextEncoder().encode('Hi'))
  })

  it('throws a typed network error when the namespace has no provider', async () => {
    boot(fakeModal())
    const account = { namespace: 'eip155' as const, chainId: 'eip155:84532', address: '0xabc', walletId: 'reown' }
    await expect(reownAdapter.signMessage(account, 'm')).rejects.toMatchObject({ code: 'network' })
  })
})

describe('authenticate (through the real connectThenSign)', () => {
  it('resolves null when the wallet declines the connect', async () => {
    const modal = fakeModal()
    // The modal opens, then the user dismisses it without connecting.
    modal.subscribeState = vi.fn((cb: (s: { open: boolean }) => void) => {
      queueMicrotask(() => {
        cb({ open: true })
        cb({ open: false })
      })
      return () => {}
    })
    boot(modal)
    await expect(reownAdapter.authenticate((a) => `MSG:${a.address}`)).resolves.toBeNull()
  })
})

describe('session teardown + restore', () => {
  it('disconnect is a no-op before the runtime ever booted (peek, never load)', async () => {
    const modal = fakeModal({ solana: 'SoL1' })
    runtimeState.current = { modal } // loadable but NOT booted
    runtimeState.peek = null
    await reownAdapter.disconnect()
    expect(modal.disconnect).not.toHaveBeenCalled()
  })

  it('disconnect tears down a booted runtime; getRestoredAccount reads it', async () => {
    const modal = fakeModal({ solana: 'SoL1' })
    boot(modal)
    await expect(reownAdapter.getRestoredAccount()).resolves.toMatchObject({ address: 'SoL1' })
    await reownAdapter.disconnect()
    expect(modal.disconnect).toHaveBeenCalledTimes(1)
  })

  it('getRestoredAccount answers null without booting the wallet stack', async () => {
    runtimeState.current = { modal: fakeModal({ solana: 'SoL1' }) }
    runtimeState.peek = null
    await expect(reownAdapter.getRestoredAccount()).resolves.toBeNull()
  })
})
