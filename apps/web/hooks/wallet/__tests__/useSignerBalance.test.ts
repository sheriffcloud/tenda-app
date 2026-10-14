/**
 * useSignerBalance — the signer-scoped "can THIS wallet fund it?" answer.
 * Only a positively-read shortfall may answer 'short' (fail-open doctrine);
 * a null spend or unresolved signer must be inert (no RPC, no registry arm).
 */
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetBalance } from '@tenda/shared'

const { spendableMock, ensureLoadedMock } = vi.hoisted(() => ({
  spendableMock: vi.fn(),
  ensureLoadedMock: vi.fn(async () => {}),
}))
vi.mock('@/hooks/wallet/useSpendableBalance', () => ({
  useSpendableBalance: (...a: unknown[]) => spendableMock(...a),
}))
vi.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: (selector: (s: { ensureLoaded: () => Promise<void> }) => unknown) =>
    selector({ ensureLoaded: ensureLoadedMock }),
}))

import { useSignerBalance } from '@/hooks/wallet/useSignerBalance'

const CHAIN = 'eip155:84532'
const SPEND = { assetId: 'USDC_BASE', amountRaw: '50000000' }

function reading(amountRaw: string): { balance: AssetBalance; status: 'ready' } {
  return {
    balance: { assetId: 'USDC_BASE', symbol: 'USDC', amountRaw, decimals: 6, isStable: true },
    status: 'ready',
  }
}

beforeEach(() => {
  spendableMock.mockReturnValue(reading('50000000'))
})

describe('funds verdict', () => {
  it('answers short with the held amount when the signer positively holds less', () => {
    spendableMock.mockReturnValue(reading('10000000'))
    const { result } = renderHook(() => useSignerBalance(CHAIN, SPEND, '0xSigner'))
    expect(result.current).toEqual({ funds: 'short', availableRaw: '10000000' })
    // The read is scoped to the previewed signer, never the whole linked set.
    expect(spendableMock).toHaveBeenCalledWith(CHAIN, 'USDC_BASE', '0xSigner')
    expect(ensureLoadedMock).toHaveBeenCalled()
  })

  it('holding exactly the debit is ok, not short (BigInt-exact boundary)', () => {
    const { result } = renderHook(() => useSignerBalance(CHAIN, SPEND, '0xSigner'))
    expect(result.current.funds).toBe('ok')
  })
})

describe('fail-open silence', () => {
  it('an unreadable balance answers unknown, never short', () => {
    spendableMock.mockReturnValue({ balance: null, status: 'ready' })
    const { result } = renderHook(() => useSignerBalance(CHAIN, SPEND, '0xSigner'))
    expect(result.current.funds).toBe('unknown')
  })

  it('a read still in flight answers unknown', () => {
    spendableMock.mockReturnValue({ balance: null, status: 'loading' })
    const { result } = renderHook(() => useSignerBalance(CHAIN, SPEND, '0xSigner'))
    expect(result.current.funds).toBe('unknown')
  })

  it('an unparseable or non-positive debit answers unknown', () => {
    const zero = renderHook(() =>
      useSignerBalance(CHAIN, { assetId: 'USDC_BASE', amountRaw: '0' }, '0xSigner'),
    )
    expect(zero.result.current.funds).toBe('unknown')
    const garbage = renderHook(() =>
      useSignerBalance(CHAIN, { assetId: 'USDC_BASE', amountRaw: 'not-a-number' }, '0xSigner'),
    )
    expect(garbage.result.current.funds).toBe('unknown')
  })
})

describe('inert states', () => {
  it('a null spend disarms the read (owner null) and never arms the registry', () => {
    const { result } = renderHook(() => useSignerBalance(CHAIN, null, '0xSigner'))
    expect(result.current.funds).toBe('unknown')
    expect(spendableMock).toHaveBeenCalledWith(CHAIN, '', null)
    expect(ensureLoadedMock).not.toHaveBeenCalled()
  })

  it('an unresolved signer disarms the read the same way', () => {
    const { result } = renderHook(() => useSignerBalance(CHAIN, SPEND, null))
    expect(result.current.funds).toBe('unknown')
    expect(spendableMock).toHaveBeenCalledWith(CHAIN, 'USDC_BASE', null)
    expect(ensureLoadedMock).not.toHaveBeenCalled()
  })
})
