import { describe, expect, it } from 'vitest'
import { LANDING_CHAINS } from '@/content/chains'
import { LIVE_CHAINS, PLANNED_CHAINS } from '@/content/chain-status'
import { FEE_PCT } from '@/content/fees'
import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared/constants/platform'
import { RECEIPTS } from '../content'

/**
 * The receipts strip is the last thing a visitor reads before downloading —
 * three mono "facts". Two of them shipped false (2026-08-27): 'Chains: 3 live'
 * beside a derived subline listing four, and 'Worker keeps 100% · No platform
 * cut on payouts' on a product whose flat fee is real, on-chain and quoted on
 * its own fees section. These pins keep each receipt tied to the source the
 * claim is actually about.
 */
describe('final CTA receipts', () => {
  const byKey = (k: string) => RECEIPTS.find((r) => r.k === k)

  /**
   * This pin used to read `String(LANDING_CHAINS.length)` — and it PASSED while
   * the receipt announced "4 live" over four chains that had no contract
   * between them. Deriving the number was never the point; deriving it from
   * the source that actually knows about deployment is. LANDING_CHAINS is the
   * list of chains the page TALKS ABOUT, which is why it was the wrong source
   * and why asserting against it again would re-admit the same false claim.
   */
  it('counts chains that are DEPLOYED, not chains that are listed', () => {
    const chains = byKey('Chains')
    expect(chains?.v).toBe(String(LIVE_CHAINS.length))
  })

  it('will not report a listed-but-undeployed chain as live', () => {
    // The regression itself, stated directly: while any listed chain is still
    // planned, the live count must come out BELOW the number of chains on the
    // page. Skipped once every listed chain ships, when the two legitimately
    // agree and the assertion would stop distinguishing anything.
    if (PLANNED_CHAINS.length === 0) return
    expect(Number(byKey('Chains')?.v)).toBeLessThan(LANDING_CHAINS.length)
  })

  it('names the chains still to come, so the count is not left unexplained', () => {
    const chains = byKey('Chains')
    for (const chain of PLANNED_CHAINS) expect(chains?.b).toContain(chain.name)
    for (const chain of LIVE_CHAINS) expect(chains?.b).toContain(chain.name)
  })

  it('quotes the worker share from the platform fee, and claims no fee-free lie', () => {
    const keeps = byKey('Worker keeps')
    expect(keeps?.v).toBe(String((10_000 - PLATFORM_CONFIG_DEFAULTS.fee_bps) / 100))
    expect(keeps?.b).toContain(`${FEE_PCT}%`)
    for (const receipt of RECEIPTS) {
      expect(receipt.b.toLowerCase()).not.toContain('no platform cut')
    }
  })
})
