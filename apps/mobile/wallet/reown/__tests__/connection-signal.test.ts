/**
 * ConnectionSignal, the React-free Reown bridge state machine. Drives the full
 * connect/disconnect promise lifecycle the `<ReownBridge>` feeds and the EVM
 * adapter consumes. Pure: no AppKit, no React, every branch is exercised here.
 */
import { ConnectionSignal, type EvmRequestProvider, type ReownLiveState } from '../connection-signal'
import { WalletError } from '@tenda/shared'
import { WALLET_CHAINS } from '../../config'

const provider: EvmRequestProvider = { request: jest.fn() }

function makeLive(overrides: Partial<ReownLiveState> = {}): ReownLiveState {
  return {
    open: jest.fn(),
    disconnect: jest.fn(async () => {}),
    provider,
    address: undefined,
    namespace: undefined,
    chainId: undefined,
    isConnected: false,
    peerRedirect: undefined,
    ...overrides,
  }
}

const connected = {
  isConnected: true,
  address: '0xABC',
  namespace: 'eip155',
  chainId: '8453',
}

describe('ConnectionSignal.connect', () => {
  it('rejects when the bridge has never synced', async () => {
    const sig = new ConnectionSignal()
    await expect(sig.connect()).rejects.toBeInstanceOf(WalletError)
    await expect(sig.connect()).rejects.toMatchObject({ code: 'network' })
  })

  it('resolves immediately with the account when already connected (no modal)', async () => {
    const sig = new ConnectionSignal()
    const live = makeLive(connected)
    sig.sync(live)
    await expect(sig.connect()).resolves.toEqual({
      namespace: 'eip155',
      chainId: 'eip155:8453',
      address: '0xABC',
      walletId: 'walletconnect',
    })
    expect(live.open).not.toHaveBeenCalled()
  })

  it('fresh skips the connected fast path and re-opens the modal (wallet-linking)', async () => {
    const sig = new ConnectionSignal()
    const live = makeLive(connected)
    sig.sync(live)
    const pending = sig.connect({ fresh: true })
    expect(live.open).toHaveBeenCalledTimes(1) // did NOT short-circuit
    // a different wallet connects in
    sig.sync(makeLive({ isConnected: true, address: '0xDEF', namespace: 'eip155', chainId: '8453' }))
    await expect(pending).resolves.toMatchObject({ address: '0xDEF' })
  })

  it('opens the modal and resolves once an account is synced in', async () => {
    const sig = new ConnectionSignal()
    const live = makeLive({ isConnected: false })
    sig.sync(live)
    const pending = sig.connect()
    expect(live.open).toHaveBeenCalledTimes(1)
    sig.sync(makeLive(connected))
    await expect(pending).resolves.toMatchObject({ address: '0xABC', chainId: 'eip155:8453' })
  })

  it('rejects (declined) when the modal closes without connecting', async () => {
    const sig = new ConnectionSignal()
    sig.sync(makeLive({ isConnected: false }))
    const pending = sig.connect()
    sig.onModalClose(false)
    await expect(pending).rejects.toMatchObject({ code: 'declined' })
  })

  it('ignores a modal close that reports connected=true, then resolves on the account', async () => {
    const sig = new ConnectionSignal()
    sig.sync(makeLive({ isConnected: false }))
    const pending = sig.connect()
    sig.onModalClose(true) // success close, must NOT reject
    sig.sync(makeLive(connected))
    await expect(pending).resolves.toMatchObject({ address: '0xABC' })
  })

  it('rejects (declined) on an explicit user rejection', async () => {
    const sig = new ConnectionSignal()
    sig.sync(makeLive({ isConnected: false }))
    const pending = sig.connect()
    sig.onUserRejected()
    await expect(pending).rejects.toMatchObject({ code: 'declined' })
  })

  it('rejects a second concurrent connect as already-in-progress', async () => {
    const sig = new ConnectionSignal()
    sig.sync(makeLive({ isConnected: false }))
    const first = sig.connect()
    await expect(sig.connect()).rejects.toMatchObject({ code: 'unknown' })
    // settle the first so no unhandled rejection lingers
    sig.onModalClose(false)
    await expect(first).rejects.toMatchObject({ code: 'declined' })
  })

  it('no-ops onModalClose / onUserRejected when nothing is pending', () => {
    const sig = new ConnectionSignal()
    sig.sync(makeLive(connected))
    expect(() => {
      sig.onModalClose(false)
      sig.onUserRejected()
    }).not.toThrow()
  })
})

describe('ConnectionSignal.disconnect', () => {
  it('resolves immediately and skips the wallet when not connected', async () => {
    const sig = new ConnectionSignal()
    const live = makeLive({ isConnected: false })
    sig.sync(live)
    await expect(sig.disconnect()).resolves.toBeUndefined()
    expect(live.disconnect).not.toHaveBeenCalled()
  })

  it('resolves immediately when no live state exists at all', async () => {
    const sig = new ConnectionSignal()
    await expect(sig.disconnect()).resolves.toBeUndefined()
  })

  it("awaits AppKit's own disconnect promise (no re-render wait)", async () => {
    const sig = new ConnectionSignal()
    let settle: (() => void) | undefined
    const live = makeLive({
      ...connected,
      disconnect: jest.fn(() => new Promise<void>((res) => { settle = res })),
    })
    sig.sync(live)

    const pending = sig.disconnect()
    expect(live.disconnect).toHaveBeenCalledTimes(1)
    let done = false
    void pending.then(() => { done = true })
    await Promise.resolve()
    expect(done).toBe(false) // still pending until AppKit settles, NOT a sync re-render
    settle?.()
    await expect(pending).resolves.toBeUndefined()
  })

  it('propagates a disconnect rejection from AppKit', async () => {
    const sig = new ConnectionSignal()
    const live = makeLive({
      ...connected,
      disconnect: jest.fn(async () => { throw new Error('relay down') }),
    })
    sig.sync(live)
    await expect(sig.disconnect()).rejects.toThrow('relay down')
  })
})

describe('ConnectionSignal accessors', () => {
  it('exposes the provider only while a session is live', () => {
    const sig = new ConnectionSignal()
    expect(sig.getProvider()).toBeUndefined()
    sig.sync(makeLive({ provider }))
    expect(sig.getProvider()).toBe(provider)
  })

  it('exposes the connected wallet deep link for foregrounding', () => {
    const sig = new ConnectionSignal()
    expect(sig.getPeerRedirect()).toBeUndefined()
    sig.sync(makeLive({ peerRedirect: 'trust://' }))
    expect(sig.getPeerRedirect()).toBe('trust://')
  })

  it('returns the account when connected and null otherwise', () => {
    const sig = new ConnectionSignal()
    expect(sig.getAccount()).toBeNull()
    sig.sync(makeLive({ isConnected: true })) // connected but no address yet
    expect(sig.getAccount()).toBeNull()
    sig.sync(makeLive(connected))
    expect(sig.getAccount()).toMatchObject({ address: '0xABC', chainId: 'eip155:8453' })
  })
})

describe('CAIP chain-id derivation', () => {
  it('prefixes a bare chain id with the namespace', () => {
    const sig = new ConnectionSignal()
    sig.sync(makeLive({ isConnected: true, address: '0x1', namespace: 'eip155', chainId: '42220' }))
    expect(sig.getAccount()?.chainId).toBe('eip155:42220')
  })

  it('passes an already-CAIP chain id through unchanged', () => {
    const sig = new ConnectionSignal()
    sig.sync(makeLive({ isConnected: true, address: '0x1', namespace: 'eip155', chainId: 'eip155:1' }))
    expect(sig.getAccount()?.chainId).toBe('eip155:1')
  })

  it('falls back to the configured primary EVM chain when chain id is missing', () => {
    const sig = new ConnectionSignal()
    sig.sync(makeLive({ isConnected: true, address: '0x1', namespace: 'eip155', chainId: undefined }))
    expect(sig.getAccount()?.chainId).toBe(WALLET_CHAINS.eip155)
  })

  it('defaults the namespace to eip155 when absent', () => {
    const sig = new ConnectionSignal()
    sig.sync(makeLive({ isConnected: true, address: '0x1', namespace: undefined, chainId: '8453' }))
    expect(sig.getAccount()?.chainId).toBe('eip155:8453')
  })
})
