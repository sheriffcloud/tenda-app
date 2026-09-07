/**
 * The sell surface's URL contract.
 *
 * `?mode=` is reader-editable and deep-linked from the wallet, so it is
 * narrowed rather than trusted — and the default stays OFF the URL so one view
 * has one address, the same rule the exchange and my-gigs surfaces follow.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SELL_MODE, SELL_COPY, sellHref, sellMode } from '@/components/wallet/sell/copy'

describe('sellMode', () => {
  it('narrows the two real modes', () => {
    expect(sellMode('instant')).toBe('instant')
    expect(sellMode('offer')).toBe('offer')
  })

  it('falls back to the default for anything else, including nothing', () => {
    expect(sellMode(null)).toBe(DEFAULT_SELL_MODE)
    expect(sellMode('')).toBe(DEFAULT_SELL_MODE)
    expect(sellMode('buy')).toBe(DEFAULT_SELL_MODE)
    expect(sellMode('OFFER')).toBe(DEFAULT_SELL_MODE)
  })
})

describe('sellHref', () => {
  it('keeps the default OFF the URL', () => {
    expect(sellHref('instant')).toBe('/wallet/buy-sell')
  })

  it('carries the non-default mode', () => {
    expect(sellHref('offer')).toBe('/wallet/buy-sell?mode=offer')
  })

  it('round-trips through the narrower', () => {
    expect(sellMode(new URLSearchParams(sellHref('offer').split('?')[1]).get('mode'))).toBe('offer')
  })
})

describe('SELL_COPY', () => {
  it('promises a fixed quote only where a quote exists', () => {
    // The comp's note says the rate is "fixed when you confirm". That is true
    // of the instant quote and NOT of an offer, whose rate is fixed when it is
    // POSTED and then sits on the book.
    expect(SELL_COPY.ctaNote('instant')).toMatch(/quote/i)
    expect(SELL_COPY.ctaNote('offer')).not.toMatch(/quote/i)
    expect(SELL_COPY.ctaNote('offer')).toMatch(/until a buyer accepts/i)
  })

  it('names each mode differently in the lede — they do different things', () => {
    expect(SELL_COPY.lede('instant')).not.toEqual(SELL_COPY.lede('offer'))
  })
})
