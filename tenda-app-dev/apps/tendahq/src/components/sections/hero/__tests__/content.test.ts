import { describe, expect, it } from 'vitest'
import { APP_INFO, FEE_EXAMPLE, FEE_PCT, GIG_ASSET_SYMBOL, LANDING_CHAINS, TRADE_MARKET_COUNT } from '@/content'
import { money2 } from '@/lib/money'
import { ESCROW_PANEL, HERO_CONTENT, HERO_STATS_FALLBACK, FEE_STAT_INDEX } from '../content'

/**
 * The hero states four numbers above the fold, and two of them are configured
 * elsewhere. This pins them to their sources and guards the one silent-failure
 * mode in how the live fee reaches the row.
 */
describe('hero stats', () => {
  /**
   * FEE_STAT_INDEX is a findIndex over a label. A miss returns -1, which no
   * array index equals, so HeroStatRow would silently keep rendering the
   * default fee forever — no error, no blank, just a stale number above the
   * fold. Renaming the label is the plausible way to cause it.
   */
  it('resolves the live-fee cell — a miss would silently freeze the fee', () => {
    expect(FEE_STAT_INDEX).toBeGreaterThanOrEqual(0)
    expect(HERO_STATS_FALLBACK[FEE_STAT_INDEX]).toBeDefined()
  })

  it('points that index at the fee cell and no other', () => {
    expect(HERO_STATS_FALLBACK[FEE_STAT_INDEX].value).toBe(`${FEE_PCT}%`)
    const feeCells = HERO_STATS_FALLBACK.filter((s) => s.value.endsWith('%') && s.value !== '100%')
    expect(feeCells).toHaveLength(1)
  })

  /**
   * Both derived cells. The fee was typed as "2.5%" here while every other
   * surface had been moved onto the shared default, and the markets count was
   * typed as "3" while being overridden from the payout registry downstream.
   */
  it('derives the fee and the market count rather than stating them', () => {
    expect(HERO_STATS_FALLBACK[FEE_STAT_INDEX].value).toBe(`${FEE_PCT}%`)
    const markets = HERO_STATS_FALLBACK.find((s) => s.label === 'Fiat markets')
    expect(markets?.value).toBe(String(TRADE_MARKET_COUNT))
  })

  it('labels every cell uniquely, since the fee cell is found by label', () => {
    const labels = HERO_STATS_FALLBACK.map((s) => s.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('stamps the release from the derived version and stage', () => {
    expect(HERO_CONTENT.stamps.versionLabel).toBe(
      `${APP_INFO.versionNumber} · ${APP_INFO.chains.stage}`,
    )
    expect(HERO_CONTENT.stamps.liveLabel).toContain(APP_INFO.chains.networksLine)
    // The stamp names the chains; it must not assert a contract on them. It
    // read "Live on 0G · Solana · Base · Celo" while all four were undeployed,
    // and this test passed throughout — it only ever checked the chain list.
    expect(HERO_CONTENT.stamps.liveLabel.toLowerCase()).not.toContain('live on')
  })

  it('takes the headline from the shared brand line, minus the period the page draws', () => {
    expect(`${HERO_CONTENT.h1}.`).toBe(APP_INFO.tagline)
    expect(HERO_CONTENT.h1.endsWith('.')).toBe(false)
  })
})

/**
 * The receipt is the hero's thesis object, and every figure on it has a
 * source: the worked fee example. These pins keep the drawing from quietly
 * disagreeing with the fee quoted further down the page.
 */
describe('hero escrow receipt', () => {
  it('prints the locked amount at two decimals, with its unit, and matches its own first row', () => {
    expect(ESCROW_PANEL.amount).toBe(money2(FEE_EXAMPLE.lockedAmount))
    expect(ESCROW_PANEL.amount).toMatch(/\.\d{2}$/)
    expect(ESCROW_PANEL.unit).toBe(GIG_ASSET_SYMBOL)
    expect(ESCROW_PANEL.rows[0].value).toBe(`${ESCROW_PANEL.amount} ${ESCROW_PANEL.unit}`)
  })

  it('derives the fee and payout rows from the worked example, marking only the payout as money', () => {
    expect(ESCROW_PANEL.rows[1].label).toBe(`Fee · ${FEE_PCT}%`)
    expect(ESCROW_PANEL.rows[1].value).toBe(`${FEE_EXAMPLE.feeAmount} ${GIG_ASSET_SYMBOL}`)
    expect(ESCROW_PANEL.rows[2].value).toBe(FEE_EXAMPLE.payout)
    const money = ESCROW_PANEL.rows.filter((r) => 'money' in r && r.money)
    expect(money).toHaveLength(1)
    expect(money[0].label).toBe('Worker receives')
  })

  it('names no chain in the custody line, and adds the assurance', () => {
    // "Held by the contract on 0G" would read as the only chain the day a
    // second mainnet goes live; the panels carry per-chain status instead.
    for (const chain of LANDING_CHAINS) expect(ESCROW_PANEL.custody).not.toContain(chain.name)
    expect(ESCROW_PANEL.custody).toBe('Held by the escrow contract. Neither party can move it.')
  })

  it('walks the contract’s four states in order, ending on the payout', () => {
    expect(ESCROW_PANEL.stages).toEqual(['Lock', 'Work', 'Approve', 'Release'])
  })
})
