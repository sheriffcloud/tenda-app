/**
 * wallet/send/session — the signing-path guards: requireTxModal's disabled
 * branch, guardTxRequest's disconnect binding (peek-only), and
 * ensureSessionOn's connect-on-demand + linked-wallet trust rule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChainNamespace, LinkedWallet } from '@tenda/shared'

interface FakeModal {
  getAddress: (ns: ChainNamespace) => string | undefined
  getAccount: (ns: ChainNamespace) => { status?: 'disconnected' } | undefined
  getCaipNetwork: (ns: ChainNamespace) => { caipNetworkId?: string } | undefined
  subscribeAccount: ReturnType<typeof vi.fn>
  subscribeState: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  getProvider: ReturnType<typeof vi.fn>
  switchNetwork: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

function fakeModal(addresses: Partial<Record<ChainNamespace, string>> = {}): FakeModal {
  return {
    getAddress: (ns) => addresses[ns],
    getAccount: () => ({ status: 'disconnected' }),
    getCaipNetwork: () => undefined,
    subscribeAccount: vi.fn(() => () => {}),
    subscribeState: vi.fn(() => () => {}),
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    getProvider: vi.fn(() => undefined),
    switchNetwork: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  }
}

const runtimeState = { current: null as { modal: FakeModal } | null, peek: null as { modal: FakeModal } | null }
vi.mock('@/wallet/runtime', () => ({
  loadWalletRuntime: async () =>
    runtimeState.current === null ? { status: 'disabled' } : { status: 'ready', runtime: runtimeState.current },
  peekWalletRuntime: () => runtimeState.peek,
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

import { requireTxModal, guardTxRequest, ensureSessionOn, switchToLinkedWallet } from '@/wallet/send/session'

function linked(ns: ChainNamespace, address: string): LinkedWallet {
  return { chain_ns: ns, address, is_primary: true, verified_at: '2026-01-01T00:00:00Z' }
}

beforeEach(() => {
  runtimeState.current = null
  runtimeState.peek = null
  authState.wallets = []
  authState.walletsStatus = 'ready'
  authState.ensureWallets.mockClear()
  waitForConnectionMock.mockReset()
  settledMock.mockReset()
  settledMock.mockResolvedValue(null) // no restore in flight unless a test says so
})

function boot(modal: FakeModal): void {
  runtimeState.current = { modal }
  runtimeState.peek = { modal }
}

describe('requireTxModal', () => {
  it('throws a typed no_wallet error when the build has no wallet config', async () => {
    await expect(requireTxModal()).rejects.toMatchObject({ name: 'WalletError', code: 'no_wallet' })
  })

  it('returns the booted modal', async () => {
    const modal = fakeModal()
    boot(modal)
    await expect(requireTxModal()).resolves.toBe(modal)
  })
})

describe('guardTxRequest', () => {
  it('passes the wallet result through', async () => {
    await expect(guardTxRequest(Promise.resolve('0xhash'))).resolves.toBe('0xhash')
  })

  it('a rejection propagates and the (peeked) session is left alone', async () => {
    const modal = fakeModal()
    boot(modal)
    await expect(guardTxRequest(Promise.reject(new Error('user rejected')))).rejects.toThrow('user rejected')
    expect(modal.disconnect).not.toHaveBeenCalled()
  })

  it('a Cancel abort disconnects the peeked session (never boots one)', async () => {
    const modal = fakeModal()
    // Booted earlier in the session: peek sees it.
    boot(modal)
    const { abortPendingWalletRequest } = await import('@tenda/shared')
    const guarded = guardTxRequest(new Promise<string>(() => {}))
    abortPendingWalletRequest()
    await expect(guarded).rejects.toMatchObject({ code: 'declined' })
    await vi.waitFor(() => expect(modal.disconnect).toHaveBeenCalledTimes(1))
  })

  it('abort with NO booted runtime does not throw (nothing to tear down)', async () => {
    const { abortPendingWalletRequest } = await import('@tenda/shared')
    const guarded = guardTxRequest(new Promise<string>(() => {}))
    abortPendingWalletRequest()
    await expect(guarded).rejects.toMatchObject({ code: 'declined' })
  })
})

describe('ensureSessionOn', () => {
  it('returns the live address when it is a verified linked wallet', async () => {
    boot(fakeModal({ eip155: '0xLive' }))
    authState.wallets = [linked('eip155', '0xLive')]
    await expect(ensureSessionOn('eip155')).resolves.toBe('0xLive')
    expect(waitForConnectionMock).not.toHaveBeenCalled()
  })

  it('opens the connect flow when no session is live, targeted at the tx namespace', async () => {
    const modal = fakeModal()
    let connected = false
    modal.getAddress = ((ns: ChainNamespace) => (connected && ns === 'solana' ? 'SoL1' : undefined)) as FakeModal['getAddress']
    boot(modal)
    authState.wallets = [linked('solana', 'SoL1')]
    waitForConnectionMock.mockImplementation(async () => {
      connected = true
    })
    await expect(ensureSessionOn('solana')).resolves.toBe('SoL1')
    expect(waitForConnectionMock).toHaveBeenCalledTimes(1)
    // Namespace-targeted: a live session on the OTHER namespace must never
    // satisfy a Solana tx, and the modal lists only wallets it can use.
    expect(waitForConnectionMock).toHaveBeenCalledWith(modal, { namespace: 'solana' })
  })

  it('a session still RESTORING is honoured — the connect modal never opens', async () => {
    // The "Review and Sign" double-dialog: the runtime boots lazily, so the
    // first getAddress of the session races the adapter's restore of a
    // persisted Phantom session. The settled read answers it; no modal.
    boot(fakeModal()) // no live address yet — restore in flight
    authState.wallets = [linked('solana', 'SoL1')]
    settledMock.mockResolvedValue({ namespace: 'solana', chainId: 'solana:devnet', address: 'SoL1', walletId: 'reown' })
    await expect(ensureSessionOn('solana')).resolves.toBe('SoL1')
    expect(settledMock).toHaveBeenCalledWith(expect.anything(), 'solana')
    expect(waitForConnectionMock).not.toHaveBeenCalled()
  })

  it('loads the trust list before checking it (a never-loaded registry refused every wallet)', async () => {
    boot(fakeModal({ eip155: '0xLive' }))
    authState.wallets = [linked('eip155', '0xLive')]
    await expect(ensureSessionOn('eip155')).resolves.toBe('0xLive')
    expect(authState.ensureWallets).toHaveBeenCalledTimes(1)
  })

  it('a wallets[] load that FAILED is a network error, never "not linked"', async () => {
    boot(fakeModal({ eip155: '0xLive' }))
    authState.walletsStatus = 'error'
    await expect(ensureSessionOn('eip155')).rejects.toMatchObject({
      code: 'network',
      message: expect.stringMatching(/could not load/i),
    })
  })

  it('a dismissal in the connect flow propagates as the typed decline', async () => {
    boot(fakeModal())
    const { WalletError } = await import('@tenda/shared')
    waitForConnectionMock.mockRejectedValue(new WalletError('declined', 'closed'))
    await expect(ensureSessionOn('eip155')).rejects.toMatchObject({ code: 'declined' })
  })

  it('connecting a wallet on the WRONG namespace still fails with no_wallet', async () => {
    // User opened the modal and connected a Solana wallet while the flow
    // needed an EVM one — the address re-read stays empty for eip155.
    boot(fakeModal({ solana: 'SoL1' }))
    authState.wallets = [linked('solana', 'SoL1')]
    waitForConnectionMock.mockResolvedValue(undefined)
    await expect(ensureSessionOn('eip155')).rejects.toMatchObject({ code: 'no_wallet' })
  })

  it('an unlinked live session gets ONE switch: namespace disconnect + fresh filtered pick', async () => {
    // Phantom's EVM side holds the eip155 session but the user linked
    // MetaMask — instead of dead-ending, the list reopens so they pick it.
    const modal = fakeModal({ eip155: '0xPhantomEvm' })
    boot(modal)
    authState.wallets = [linked('eip155', '0xLinkedLinkedLinkedLinked')]
    waitForConnectionMock.mockResolvedValue({
      namespace: 'eip155',
      chainId: 'eip155:84532',
      address: '0xLinkedLinkedLinkedLinked',
      walletId: 'reown',
    })
    await expect(ensureSessionOn('eip155')).resolves.toBe('0xLinkedLinkedLinkedLinked')
    expect(modal.disconnect).toHaveBeenCalledWith('eip155') // scoped — Solana session survives
    expect(waitForConnectionMock).toHaveBeenCalledWith(modal, { namespace: 'eip155', fresh: true })
  })

  it('a switch pick that is ALSO unlinked is refused, naming the wallets that would work', async () => {
    boot(fakeModal({ eip155: '0xStrangerStrangerStranger' }))
    authState.wallets = [linked('eip155', '0xLinkedLinkedLinkedLinked')]
    waitForConnectionMock.mockResolvedValue({
      namespace: 'eip155',
      chainId: 'eip155:84532',
      address: '0xAnotherStrangerWallet00',
      walletId: 'reown',
    })
    await expect(ensureSessionOn('eip155')).rejects.toMatchObject({
      code: 'no_wallet',
      // Names the linked wallet (truncated) so the user knows WHICH to pick.
      message: expect.stringContaining('linked wallets (0xLi…nked)'),
    })
  })

  it('dismissing the switch surfaces the WHY, not a bare decline', async () => {
    boot(fakeModal({ eip155: '0xStrangerStrangerStranger' }))
    authState.wallets = [linked('eip155', '0xLinkedLinkedLinkedLinked')]
    const { WalletError } = await import('@tenda/shared')
    waitForConnectionMock.mockRejectedValue(new WalletError('declined', 'closed'))
    await expect(ensureSessionOn('eip155')).rejects.toMatchObject({
      code: 'no_wallet',
      message: expect.stringContaining('linked wallets (0xLi…nked)'),
    })
  })

  it('an unverified linked wallet does not count', async () => {
    boot(fakeModal({ eip155: '0xPending' }))
    authState.wallets = [{ chain_ns: 'eip155', address: '0xPending', is_primary: false, verified_at: null }]
    const { WalletError } = await import('@tenda/shared')
    waitForConnectionMock.mockRejectedValue(new WalletError('declined', 'closed'))
    await expect(ensureSessionOn('eip155')).rejects.toMatchObject({ code: 'no_wallet' })
  })
})

describe('switchToLinkedWallet (the dialog affordance)', () => {
  it('returns the picked linked address', async () => {
    const modal = fakeModal()
    boot(modal)
    authState.wallets = [linked('solana', 'SoL1')]
    waitForConnectionMock.mockResolvedValue({
      namespace: 'solana',
      chainId: 'solana:devnet',
      address: 'SoL1',
      walletId: 'reown',
    })
    await expect(switchToLinkedWallet('solana')).resolves.toBe('SoL1')
    expect(modal.disconnect).toHaveBeenCalledWith('solana')
  })

  it('propagates a dismissal as the typed decline — a change of mind, not an error', async () => {
    boot(fakeModal())
    authState.wallets = [linked('solana', 'SoL1')]
    const { WalletError } = await import('@tenda/shared')
    waitForConnectionMock.mockRejectedValue(new WalletError('declined', 'closed'))
    await expect(switchToLinkedWallet('solana')).rejects.toMatchObject({ code: 'declined' })
  })

  it('refuses a stranger pick by name', async () => {
    boot(fakeModal())
    authState.wallets = [linked('solana', 'SoLLinkedLinkedLinked1')]
    waitForConnectionMock.mockResolvedValue({
      namespace: 'solana',
      chainId: 'solana:devnet',
      address: 'SoLStranger',
      walletId: 'reown',
    })
    await expect(switchToLinkedWallet('solana')).rejects.toMatchObject({
      code: 'no_wallet',
      message: expect.stringContaining('linked wallets ('),
    })
  })
})
