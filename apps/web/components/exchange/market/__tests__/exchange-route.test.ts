/**
 * The exchange surface's URL contract. Everything the reader sets is in the
 * address, so these are the functions that decide whether a filtered book can
 * be shared, and whether it survives opening an offer and coming back.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXCHANGE_TAB,
  currencyChipLabel,
  exchangeCurrency,
  exchangeHref,
  exchangeTab,
  rateUnitLabel,
} from '@/components/exchange/market/copy'

describe('exchangeTab', () => {
  it('narrows the two real tabs', () => {
    expect(exchangeTab('market')).toBe('market')
    expect(exchangeTab('mine')).toBe('mine')
  })

  it('falls back to the default for anything else, including nothing', () => {
    expect(exchangeTab(null)).toBe(DEFAULT_EXCHANGE_TAB)
    expect(exchangeTab('')).toBe(DEFAULT_EXCHANGE_TAB)
    expect(exchangeTab('buy')).toBe(DEFAULT_EXCHANGE_TAB)
  })
})

describe('exchangeCurrency', () => {
  it('accepts a payout currency', () => {
    expect(exchangeCurrency('NGN')).toBe('NGN')
  })

  it('refuses anything that is not one, rather than forwarding it', () => {
    // `?cur=` is reader-editable. Forwarding "XYZ" would ask the server to
    // filter on a currency no offer can carry — an empty book with no
    // explanation, when the honest answer is "that is not a filter".
    expect(exchangeCurrency('XYZ')).toBeNull()
    expect(exchangeCurrency('ngn')).toBeNull()
    expect(exchangeCurrency(null)).toBeNull()
  })
})

describe('exchangeHref', () => {
  it('keeps the defaults OFF the URL, so one view has one address', () => {
    expect(exchangeHref({ tab: 'market', currency: null, chainId: null })).toBe('/exchange')
  })

  it('carries every non-default key', () => {
    expect(exchangeHref({ tab: 'mine', currency: 'KES', chainId: 'solana:devnet' })).toBe(
      '/exchange?tab=mine&cur=KES&chain=solana%3Adevnet',
    )
  })

  it('carries a filter without the tab, and a tab without the filters', () => {
    expect(exchangeHref({ tab: 'market', currency: 'GHS', chainId: null })).toBe(
      '/exchange?cur=GHS',
    )
    expect(exchangeHref({ tab: 'mine', currency: null, chainId: null })).toBe('/exchange?tab=mine')
  })

  it('round-trips through the narrowers', () => {
    const href = exchangeHref({ tab: 'mine', currency: 'NGN', chainId: 'eip155:84532' })
    const search = new URLSearchParams(href.slice(href.indexOf('?')))
    expect(exchangeTab(search.get('tab'))).toBe('mine')
    expect(exchangeCurrency(search.get('cur'))).toBe('NGN')
    expect(search.get('chain')).toBe('eip155:84532')
  })
})

describe('labels', () => {
  it('names the rate pair from the offer, never a hardcoded ticker', () => {
    expect(rateUnitLabel('NGN', 'USDC_SOL')).toBe('NGN / USDC')
    // An asset the display metadata does not know still renders as itself.
    expect(rateUnitLabel('KES', 'MYSTERY')).toBe('KES / MYSTERY')
  })

  it('writes a currency chip as symbol + code', () => {
    expect(currencyChipLabel('NGN')).toBe('₦ NGN')
  })
})
