/**
 * useSigningWallet — the signer preview must resolve exactly as dispatch
 * does (session-if-linked, else primary linked), and the switch action must
 * treat a dismissal as a change of mind while surfacing a refused pick.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletError, type ChainNamespace, type LinkedWallet } from '@tenda/shared'

const { switchMock, connectAsMock, sessionMock } = vi.hoisted(() => ({
  switchMock: vi.fn(),
  connectAsMock: vi.fn(),
  sessionMock: vi.fn(),
}))
vi.mock('@/wallet/send', () => ({
  switchToLinkedWallet: (...a: unknown[]) => switchMock(...a),
  connectAsWallet: (...a: unknown[]) => connectAsMock(...a),
}))
vi.mock('@/wallet/dispatch', () => ({
  sessionAddressFor: (...a: unknown[]) => sessionMock(...a),
}))

const authState = {
  wallets: [] as LinkedWallet[],
  ensureWallets: vi.fn(async () => {}),
}
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}))

import { useSigningWallet } from '@/hooks/wallet/useSigningWallet'

function linked(ns: ChainNamespace, address: string, is_primary = true): LinkedWallet {
  return { chain_ns: ns, address, is_primary, verified_at: '2026-01-01T00:00:00Z' }
}

beforeEach(() => {
  authState.wallets = []
  sessionMock.mockReturnValue(null)
})

describe('signer resolution', () => {
  it('previews the live session address when it is linked — what dispatch will sign with', () => {
    authState.wallets = [linked('eip155', '0xPrimary'), linked('eip155', '0xLive', false)]
    sessionMock.mockReturnValue('0xLive')
    const { result } = renderHook(() => useSigningWallet('eip155:84532'))
    expect(result.current.namespace).toBe('eip155')
    expect(result.current.address).toBe('0xLive')
    expect(authState.ensureWallets).toHaveBeenCalled()
  })

  it('an unlinked session falls back to the primary linked wallet', () => {
    authState.wallets = [linked('eip155', '0xPrimary')]
    sessionMock.mockReturnValue('0xStranger')
    const { result } = renderHook(() => useSigningWallet('eip155:84532'))
    expect(result.current.address).toBe('0xPrimary')
  })

  it('no linked wallet on the namespace → null address; unknown chain → null namespace', () => {
    const { result } = renderHook(() => useSigningWallet('eip155:84532'))
    expect(result.current.address).toBeNull()
    const unknown = renderHook(() => useSigningWallet('eip155:999999'))
    expect(unknown.result.current.namespace).toBeNull()
    expect(unknown.result.current.address).toBeNull()
  })
})

describe('switchWallet', () => {
  it('switches on the chain namespace and re-reads the session', async () => {
    authState.wallets = [linked('solana', 'SoL1')]
    switchMock.mockResolvedValue('SoL1')
    const { result } = renderHook(() => useSigningWallet('solana:devnet'))
    await act(() => result.current.switchWallet())
    expect(switchMock).toHaveBeenCalledWith('solana')
    expect(result.current.error).toBeNull()
  })

  it('a dismissal is a change of mind — no error surfaces', async () => {
    switchMock.mockRejectedValue(new WalletError('declined', 'closed'))
    const { result } = renderHook(() => useSigningWallet('solana:devnet'))
    await act(() => result.current.switchWallet())
    expect(result.current.error).toBeNull()
  })

  it('a refused pick surfaces its message (the linked wallets, by name)', async () => {
    switchMock.mockRejectedValue(
      new WalletError('no_wallet', 'Connect one of your linked wallets (SoL1…SoL1) to sign this transaction'),
    )
    const { result } = renderHook(() => useSigningWallet('solana:devnet'))
    await act(() => result.current.switchWallet())
    expect(result.current.error).toContain('linked wallets')
  })

  it('exposes the in-flight state while the pick is open', async () => {
    let release: (v: string) => void = () => {}
    switchMock.mockReturnValue(
      new Promise<string>((resolve) => {
        release = resolve
      }),
    )
    const { result } = renderHook(() => useSigningWallet('solana:devnet'))
    act(() => {
      void result.current.switchWallet()
    })
    await waitFor(() => expect(result.current.switching).toBe(true))
    act(() => release('SoL1'))
    await waitFor(() => expect(result.current.switching).toBe(false))
  })

  it('is inert on an unknown chain (no namespace to switch on)', async () => {
    const { result } = renderHook(() => useSigningWallet('eip155:999999'))
    await act(() => result.current.switchWallet())
    expect(switchMock).not.toHaveBeenCalled()
  })
})

describe('bound signer (the chain already fixed the wallet)', () => {
  it('the bound address IS the preview — session and primary are overruled', () => {
    authState.wallets = [linked('eip155', '0xPrimary')]
    sessionMock.mockReturnValue('0xLiveOther')
    const { result } = renderHook(() => useSigningWallet('eip155:84532', '0xBound'))
    expect(result.current.address).toBe('0xBound')
    expect(result.current.bound).toBe(true)
  })

  it('the affordance becomes the TARGETED connect, never the free switch', async () => {
    connectAsMock.mockResolvedValue('0xBound')
    const { result } = renderHook(() => useSigningWallet('eip155:84532', '0xBound'))
    await act(() => result.current.switchWallet())
    expect(connectAsMock).toHaveBeenCalledWith('eip155', '0xBound')
    expect(switchMock).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
  })

  it('a null bound (no binding recorded) is exactly the free behaviour', async () => {
    authState.wallets = [linked('eip155', '0xPrimary')]
    switchMock.mockResolvedValue('0xPrimary')
    const { result } = renderHook(() => useSigningWallet('eip155:84532', null))
    expect(result.current.bound).toBe(false)
    expect(result.current.address).toBe('0xPrimary')
    await act(() => result.current.switchWallet())
    expect(switchMock).toHaveBeenCalledWith('eip155')
    expect(connectAsMock).not.toHaveBeenCalled()
  })

  it('a refused targeted connect surfaces its named message', async () => {
    connectAsMock.mockRejectedValue(
      new WalletError('no_wallet', 'Connect 0xBo…und — the wallet this escrow is signed by — to continue'),
    )
    const { result } = renderHook(() => useSigningWallet('eip155:84532', '0xBound'))
    await act(() => result.current.switchWallet())
    expect(result.current.error).toContain('the wallet this escrow is signed by')
  })
})
