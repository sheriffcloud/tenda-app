import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CURRENCIES, EXAMPLE_ESCROW, EXAMPLE_TASKS, GIG_ASSET_SYMBOL, LANDING_CHAINS } from '@/content'
import { AppScreens } from '../AppScreens'
import { APP_SCREENS_HEADER, ESCROW_SCREEN, GIGS_SCREEN, SCREEN_CAPTIONS, WALLET_APPROX, WALLET_SCREEN } from '../content'

/**
 * The three screens are drawings, but every figure on them has a source on
 * the page, and these pins keep the drawing from quietly disagreeing with it.
 */
const html = renderToStaticMarkup(<AppScreens surface="alt" />)

describe('§00 inside the app', () => {
  it('renders three screens, each named for assistive tech', () => {
    expect(html.match(/role="img"/g)).toHaveLength(3)
    expect(html).toContain('Gigs screen')
    expect(html).toContain('Escrow screen')
    expect(html).toContain('Wallet screen')
  })

  it('opens on the rule, the two-line headline and every fact', () => {
    expect(html).toContain(APP_SCREENS_HEADER.title)
    for (const line of APP_SCREENS_HEADER.h2) expect(html).toContain(line)
    for (const fact of APP_SCREENS_HEADER.facts) {
      expect(html).toContain(fact.lead)
      expect(html).toContain(fact.rest)
    }
    for (const cap of SCREEN_CAPTIONS) expect(html).toContain(cap.b)
  })

  it('shows real showcased gigs on the feed, not typed ones', () => {
    expect(EXAMPLE_TASKS).toContain(GIGS_SCREEN.lead.task)
    expect(EXAMPLE_TASKS).toContain(GIGS_SCREEN.next.task)
    expect(html).toContain(GIGS_SCREEN.lead.task.title)
    expect(html).toContain(`${GIGS_SCREEN.lead.task.amountUsdc} ${GIG_ASSET_SYMBOL}`)
    expect(html).toContain(GIGS_SCREEN.lead.action)
  })

  it('draws the SAME escrow the hero receipt draws, row for row', () => {
    // One example, two drawings. The screen used to re-derive these rows in
    // its own words, which is the shape that turns into two receipts.
    expect(ESCROW_SCREEN.amount).toBe(EXAMPLE_ESCROW.amount)
    expect(ESCROW_SCREEN.rows).toBe(EXAMPLE_ESCROW.rows)
    for (const row of ESCROW_SCREEN.rows) expect(html).toContain(row.value)
    expect(ESCROW_SCREEN.stages.map((s) => s.label)).toEqual(EXAMPLE_ESCROW.stages)
  })

  it('stands at Work: the lock ticked, the work current, the rest numbered and ahead', () => {
    const [lock, work, ...ahead] = ESCROW_SCREEN.stages
    expect(lock).toMatchObject({ n: '✓', state: 'done' })
    expect(work).toMatchObject({ n: '2', state: 'now' })
    for (const [i, stage] of ahead.entries()) {
      expect(stage.state).toBe('todo')
      expect(stage.n).toBe(String(i + 3))
    }
    expect(ESCROW_SCREEN.stages).toHaveLength(EXAMPLE_ESCROW.stages.length)
  })

  it('lists one wallet row per landing chain, from the manifest', () => {
    expect(WALLET_SCREEN.rows.map((r) => r.chain.id)).toEqual(LANDING_CHAINS.map((c) => c.id))
    for (const chain of LANDING_CHAINS) {
      expect(html).toContain(chain.name)
      expect(html).toContain(chain.id)
    }
    expect(WALLET_SCREEN.approx).toContain(String(LANDING_CHAINS.length))
  })

  it('sums the per-chain split to the wallet headline', () => {
    const total = WALLET_SCREEN.rows.reduce((sum, r) => sum + Number(r.amount), 0)
    expect(total.toFixed(2)).toBe(WALLET_SCREEN.amount)
  })

  /**
   * The wallet's local reading divides out to a rate against the balance, so
   * it follows the rule content/trades.ts sets for every fiat figure on the
   * page: two significant figures, never a number that reads as a quote.
   */
  it('rounds the local-currency reading too roundly to read as a rate', () => {
    const significantFigures = (n: number): number =>
      n.toExponential().replace(/e[+-]\d+$/, '').replace('.', '').replace(/0+$/, '').length
    expect(significantFigures(WALLET_APPROX.amount)).toBeLessThanOrEqual(2)
    expect(WALLET_SCREEN.approx).toContain(CURRENCIES[WALLET_APPROX.currency].symbol)
    expect(WALLET_SCREEN.approx).toContain(WALLET_APPROX.amount.toLocaleString('en-US'))
    expect(html).toContain(WALLET_SCREEN.approx)
  })

  it('groups the three screens under one accessible name', () => {
    expect(html).toContain(`role="group" aria-label="${APP_SCREENS_HEADER.screensLabel}"`)
  })

  it('names no chain in the custody line', () => {
    // A deployment claim; the whole-page guard checks the verb, this checks
    // the screen names no chain at all, so a second mainnet cannot date it.
    expect(ESCROW_SCREEN.custody).toContain('Held by the escrow contract')
    for (const chain of LANDING_CHAINS) expect(ESCROW_SCREEN.custody).not.toContain(chain.name)
  })
})
