import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PAYOUT_COUNTRY_SPECS, PAYOUT_CURRENCIES } from '@tenda/shared/fiat/payout'
import { SUPPORTED_CURRENCIES } from '../currencies'
import { EXAMPLE_TRADES } from '../trades'
import { LANDING_CHAINS } from '../chains'
import { PRODUCT_PANELS } from '@/components/sections/two-products/content'
import { TwoProducts } from '@/components/sections/two-products/TwoProducts'
import {
  DISPLAY_CURRENCY_COUNT,
  TRADE_COUNTRIES_PROSE,
  TRADE_CURRENCIES,
  TRADE_CURRENCIES_PROSE,
  TRADE_COUNTRY_NAMES,
  TRADE_MARKET_COUNT,
} from '../markets'

/**
 * The distinction this whole module exists to hold: what you can DISPLAY a
 * balance in is not what you can TRADE in. The landing shipped "8 corridors"
 * by counting the wrong list, so these tests pin the two apart and pin each to
 * its real source.
 *
 * Neither count is named here. This docstring said "(8)" and "(3)"; display is
 * now nine and payout six, so a comment introducing a file about stale numbers
 * was itself stating two.
 */
describe('fiat markets', () => {
  it('takes the tradable currencies from the payout registry, not the display list', () => {
    expect(TRADE_CURRENCIES).toEqual(PAYOUT_CURRENCIES)
  })

  it('keeps the display-currency count separate from the market count', () => {
    expect(DISPLAY_CURRENCY_COUNT).toBe(SUPPORTED_CURRENCIES.length)
    expect(TRADE_MARKET_COUNT).toBe(Object.keys(PAYOUT_COUNTRY_SPECS).length)
  })

  /**
   * The regression the copy actually shipped. If these two ever coincide the
   * page can conflate them again without anyone noticing, so the day payout
   * reaches every display currency, this test should be deleted deliberately
   * rather than silently pass.
   *
   * The gap is narrowing and that is the point of keeping it: payout was three
   * markets when this was written and is now six, against nine display
   * currencies. Three more markets and this assertion becomes the alarm.
   */
  it('has strictly fewer tradable markets than display currencies today', () => {
    expect(TRADE_MARKET_COUNT).toBeLessThan(DISPLAY_CURRENCY_COUNT)
  })

  it('names every payout country, in registry order', () => {
    expect(TRADE_COUNTRY_NAMES).toEqual(
      Object.values(PAYOUT_COUNTRY_SPECS).map((s) => s.countryName),
    )
  })

  it('renders both lists as sentence prose', () => {
    expect(TRADE_COUNTRIES_PROSE).toContain(TRADE_COUNTRY_NAMES[0])
    expect(TRADE_COUNTRIES_PROSE).toContain(' and ')
    expect(TRADE_CURRENCIES_PROSE).toContain(TRADE_CURRENCIES[0])
  })

  /**
   * Every shipped chain gets a sample row — the deck is the Exchange's shop
   * window, and a chain missing from it reads as a chain the Exchange skips.
   * 0G leads the deck (launch positioning, 2026-08-27), mirroring
   * LANDING_CHAINS' order contract.
   */
  it('shows at least one trade per landing chain, with 0G leading the deck', () => {
    const sampled = new Set(EXAMPLE_TRADES.map((t) => t.asset.chainFamily))
    for (const chain of LANDING_CHAINS) expect(sampled).toContain(chain.family)
    expect(EXAMPLE_TRADES[0]?.asset.chainFamily).toBe('0g')
  })

  /**
   * The trade deck reads as a product screenshot, so a row denominated in a
   * currency the Exchange would refuse is a promise the app breaks. The rows
   * are hand-curated; this is what stops the next hand-curated row drifting.
   */
  it('showcases only currencies an offer can actually be denominated in', () => {
    for (const trade of EXAMPLE_TRADES) {
      expect(PAYOUT_CURRENCIES).toContain(trade.fiat.currency)
    }
  })

  /**
   * THE CARDS PUBLISH AN EXCHANGE RATE WHETHER THEY MEAN TO OR NOT: each row's
   * two amounts divide out to one. 120 USDC for 187,200 NGN was stating 1,560
   * NGN/USDC on a marketplace page, where a precise figure reads as the rate
   * you will be offered — which Tenda does not set and cannot honour. The file
   * has no live source either, so that implied rate ages with the naira and
   * nothing here notices.
   *
   * Rounding to two significant figures is what makes the numbers read as
   * illustrative; this is what keeps them that way, so the next hand-added
   * corridor cannot quietly reintroduce ₦187,200.
   */
  it('quotes fiat amounts too roundly to read as a rate', () => {
    const significantFigures = (n: number): number =>
      n.toExponential().replace(/e[+-]\d+$/, '').replace('.', '').replace(/0+$/, '').length

    expect(EXAMPLE_TRADES.length).toBeGreaterThan(0)
    for (const trade of EXAMPLE_TRADES) {
      expect(Number.isInteger(trade.fiat.amount)).toBe(true)
      expect(trade.fiat.amount).toBeGreaterThan(0)
      expect(significantFigures(trade.fiat.amount)).toBeLessThanOrEqual(2)
    }
  })

  /**
   * The other half of the same claim, read off the RENDERED section rather
   * than the constants: the exchange half prints NO fiat amount at all — its
   * rows carry the currency code, so nothing on the page divides out to a
   * rate — and its foot line says who prices the offer. A constant nobody
   * renders proves nothing.
   */
  it('prints no fiat figure, and names who prices the offer', () => {
    const html = renderToStaticMarkup(createElement(TwoProducts, { surface: 'base' }))
    const exchange = PRODUCT_PANELS.find((p) => p.id === 'exchange')
    expect(exchange).toBeDefined()
    expect(html).toContain(exchange?.foot)
    expect(exchange?.foot.toLowerCase()).toContain('seller sets the rate')
    for (const trade of EXAMPLE_TRADES) {
      expect(html).not.toContain(trade.fiat.amount.toLocaleString('en-US'))
    }
  })

  /**
   * Not every market declares a mobile_money rail — Ghana and the Philippines
   * do, the rest are bank-only — so the mapping is read from the specs rather
   * than asserted from memory. The deck previously showed M-Pesa against KES,
   * which named an integration that does not exist in a country with no
   * mobile-money spec. An earlier version of this comment said "only Ghana",
   * which stopped being true when the Philippines shipped.
   */
  it('only shows a mobile-money rail for countries whose spec declares one', () => {
    const currencyToRails = new Map(
      Object.values(PAYOUT_COUNTRY_SPECS).map((spec) => [
        spec.currency,
        spec.rails.map((r) => r.kind),
      ]),
    )
    for (const trade of EXAMPLE_TRADES) {
      if (trade.fiat.rail !== 'Mobile money') continue
      expect(currencyToRails.get(trade.fiat.currency)).toContain('mobile_money')
    }
  })
})
