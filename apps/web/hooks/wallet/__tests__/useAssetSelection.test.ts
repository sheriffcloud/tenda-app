/**
 * Which asset/chain the sell surface is working with.
 *
 * The property that matters is what happens when the option SET changes — a
 * wallet linked or unlinked mid-session must not leave the panel pointing at
 * an option that is no longer offered.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assetOptionKey, useAssetSelection } from '@/hooks/wallet/useAssetSelection'
import type { ExchangeAssetOption } from '@/hooks/exchange/useExchangeAssetOptions'

const options = vi.hoisted(() => ({ current: [] as ExchangeAssetOption[] }))
vi.mock('@/hooks/exchange/useExchangeAssetOptions', () => ({
  // The hook answers WHY the list is empty as well as the list (#60); the
  // section is passed straight through, so a mock that omits it would make
  // the pass-through unobservable.
  useExchangeAssetOptions: () => ({
    options: options.current,
    section: options.current.length > 0 ? 'ready' : 'no-wallet',
  }),
}))

const opt = (over: Partial<ExchangeAssetOption> = {}): ExchangeAssetOption =>
  ({
    chainId: 'solana:devnet',
    assetId: 'USDC_SOL',
    symbol: 'USDC',
    decimals: 6,
    walletAddress: 'SoLAddr1',
    ...over,
  }) as ExchangeAssetOption

beforeEach(() => {
  options.current = []
})

describe('useAssetSelection', () => {
  it('is null when the reader has no verified wallet for anything', () => {
    const { result } = renderHook(() => useAssetSelection())
    expect(result.current.option).toBeNull()
    expect(result.current.selectedKey).toBe('')
  })

  it('defaults to the first option', () => {
    options.current = [opt(), opt({ chainId: 'eip155:84532', assetId: 'USDC_BASE' })]
    const { result } = renderHook(() => useAssetSelection())
    expect(result.current.option?.assetId).toBe('USDC_SOL')
  })

  it('honours a pick', () => {
    const base = opt({ chainId: 'eip155:84532', assetId: 'USDC_BASE' })
    options.current = [opt(), base]
    const { result } = renderHook(() => useAssetSelection())
    act(() => result.current.select(base))
    expect(result.current.option?.assetId).toBe('USDC_BASE')
  })

  it('re-resolves when the picked option DISAPPEARS mid-session', () => {
    const base = opt({ chainId: 'eip155:84532', assetId: 'USDC_BASE' })
    options.current = [opt(), base]
    const { result, rerender } = renderHook(() => useAssetSelection())
    act(() => result.current.select(base))
    expect(result.current.option?.assetId).toBe('USDC_BASE')

    // That wallet is unlinked; the option set shrinks.
    options.current = [opt()]
    rerender()
    expect(result.current.option?.assetId).toBe('USDC_SOL')
  })

  it('keys an option by chain, asset AND wallet — the same asset on two wallets is two options', () => {
    const a = opt({ walletAddress: 'SoLAddr1' })
    const b = opt({ walletAddress: 'SoLAddr2' })
    expect(assetOptionKey(a)).not.toEqual(assetOptionKey(b))
  })
})

it('passes the empty-reason through to the surface', () => {
  // The selection object is what reaches SellAssetAmount, so the reason has to
  // travel with it — otherwise the surface is back to one rendering for four
  // causes.
  options.current = []
  const empty = renderHook(() => useAssetSelection())
  expect(empty.result.current.section).toBe('no-wallet')

  options.current = [opt()]
  const ready = renderHook(() => useAssetSelection())
  expect(ready.result.current.section).toBe('ready')
})
