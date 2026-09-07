import { describe, expect, it } from 'vitest'
import { GIG_CATEGORIES } from '@/content/categories'
import { LANDING_CHAINS } from '../chains'
import { ECOSYSTEMS_HEADER, ECOSYSTEM_PANELS } from '../ecosystems'
import {
  EXAMPLE_TASKS,
  MAX_TITLE_LENGTH,
  PAYOUT_MARKET_CODES,
  REMOTE_CITY,
  REMOTE_FLAG,
  TASK_COUNTRIES,
  flagFor,
} from '../tasks'
import { EXAMPLE_TRADES } from '../trades'

/**
 * The showcased datasets and the ecosystem panels read as product screenshots.
 * A row that names something the product cannot do is a promise it breaks, and
 * these are all hand-curated files where the next edit is the risk.
 */
describe('ecosystem panels', () => {
  it('shows a panel for a chain the manifest actually ships', () => {
    const families = LANDING_CHAINS.map((c) => c.family)
    for (const panel of ECOSYSTEM_PANELS) {
      expect(families).toContain(panel.chainFamily)
    }
  })

  it('gives every shipped chain a panel', () => {
    const panelled = ECOSYSTEM_PANELS.map((p) => p.chainFamily)
    for (const chain of LANDING_CHAINS) {
      expect(panelled).toContain(chain.family)
    }
  })

  /**
   * The eyebrow said "three ecosystems" beside a panel list built from the
   * manifest, so a fourth chain would have contradicted the grid below it.
   */
  it('counts ecosystems in the eyebrow from the manifest, not by hand', () => {
    expect(ECOSYSTEMS_HEADER.eyebrow).toContain(String(LANDING_CHAINS.length))
  })

  /**
   * The empty-string guard is load-bearing: `toContain('')` is vacuously true,
   * so without it this assertion passes for a chain whose strength was
   * deleted — which is precisely the drift it exists to catch.
   */
  it('explains every chain it names in the sub-head', () => {
    for (const chain of LANDING_CHAINS) {
      expect(chain.strength).not.toBe('')
      expect(ECOSYSTEMS_HEADER.sub).toContain(chain.strength)
      expect(ECOSYSTEMS_HEADER.sub).toContain(chain.name)
    }
  })

  it('gives every panel at least one shipped proof point', () => {
    for (const panel of ECOSYSTEM_PANELS) {
      expect(panel.why).not.toBe('')
      expect(panel.proofs.filter((p) => p.roadmap !== true).length).toBeGreaterThan(0)
    }
  })

  /**
   * A roadmap proof must be FLAGGED, never phrased as shipped. The Base
   * sponsorship rail sat here as an unflagged-looking "in progress" item while
   * its build path was known-invalid.
   */
  it('never phrases a roadmap proof as already available', () => {
    for (const panel of ECOSYSTEM_PANELS) {
      for (const proof of panel.proofs) {
        if (proof.roadmap === true) continue
        expect(proof.label.toLowerCase()).not.toContain('coming')
        expect(proof.label.toLowerCase()).not.toContain('in progress')
      }
    }
  })
})

describe('showcased gigs', () => {
  it('uses only real gig categories', () => {
    for (const task of EXAMPLE_TASKS) {
      expect(GIG_CATEGORIES).toContain(task.category)
    }
  })

  it('gives every showcased row a unique id', () => {
    for (const rows of [EXAMPLE_TASKS.map((t) => t.id), EXAMPLE_TRADES.map((t) => t.id)]) {
      expect(new Set(rows).size).toBe(rows.length)
    }
  })

  /** Gigs are USDC-only on every chain, and the deck prices them in USDC. */
  it('prices every showcased gig positively', () => {
    for (const task of EXAMPLE_TASKS) {
      expect(task.amountUsdc).toBeGreaterThan(0)
    }
  })

  it('showcases trades only on chains the manifest ships', () => {
    const families = LANDING_CHAINS.map((c) => c.family)
    for (const trade of EXAMPLE_TRADES) {
      expect(families).toContain(trade.asset.chainFamily)
    }
  })
})

/**
 * The showcased gigs name real places, and a place is a claim: a worker there
 * has to be able to actually get paid. These pin the sample deck to the payout
 * registry so "somewhere plausible" cannot be typed into a seed row.
 */
describe('showcased gigs name markets we settle in', () => {
  it('names only countries the payout registry supports', () => {
    for (const country of TASK_COUNTRIES) {
      expect(PAYOUT_MARKET_CODES).toContain(country)
    }
  })

  /**
   * The other direction, and the one that catches an Africa-only deck: every
   * market the product settles should appear somewhere in the samples, or the
   * page shows a narrower footprint than the product has.
   */
  it('shows a gig in every market the registry settles', () => {
    for (const code of PAYOUT_MARKET_CODES) {
      expect(TASK_COUNTRIES).toContain(code)
    }
  })

  it('gives every located gig its own market’s flag', () => {
    for (const task of EXAMPLE_TASKS) {
      expect(task.flag).toBe(flagFor(task.country))
      expect(task.flag).not.toBe('')
    }
  })

  /**
   * `flagFor` falls back to the globe, so a market added to the registry
   * without a flag renders a plausible-looking wrong glyph rather than an
   * obvious blank. That is precisely why it is asserted here instead of being
   * left to the eye.
   */
  it('has a distinct flag for every payout market, not the remote fallback', () => {
    for (const code of PAYOUT_MARKET_CODES) {
      expect(flagFor(code)).not.toBe(REMOTE_FLAG)
    }
  })

  /**
   * The fallback branch, which no seed currently takes. It resolves to the
   * globe rather than throwing or rendering an empty span — so a country code
   * typed into a seed with no flag entry degrades to something legible, and
   * the distinct-flag test above is what actually reports it.
   */
  it('falls back to the remote glyph for a country it has no flag for', () => {
    expect(flagFor('VN')).toBe(REMOTE_FLAG)
    expect(flagFor('')).toBe(REMOTE_FLAG)
  })

  /**
   * Inherited keys are not markets. The flag map is a plain object literal, so
   * `COUNTRY_FLAG['toString']` is the inherited function — truthy, so the
   * `?? REMOTE_FLAG` fallback never fired and a `string`-typed accessor
   * returned a function. See the matching case in chains.test.ts.
   */
  it('treats prototype keys as unknown countries, not as flags', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'valueOf']) {
      expect(flagFor(key)).toBe(REMOTE_FLAG)
      expect(typeof flagFor(key)).toBe('string')
    }
  })

  it('marks remote work as remote in both the city and the flag', () => {
    for (const task of EXAMPLE_TASKS) {
      if (task.country !== null) continue
      expect(task.city).toBe(REMOTE_CITY)
      expect(task.flag).toBe(REMOTE_FLAG)
    }
  })

  /**
   * A located gig must not be labelled "Remote", which would pair a country
   * flag with a city claiming no location.
   */
  it('never labels a located gig as remote', () => {
    for (const task of EXAMPLE_TASKS) {
      if (task.country === null) continue
      expect(task.city).not.toBe(REMOTE_CITY)
    }
  })

  /**
   * The deck is deliberately weighted away from being Africa-only (user
   * decision). Asserted as a proportion of LOCATED gigs rather than a fixed
   * count, so adding samples cannot silently tip it back — it caught the first
   * draft at exactly 13-13, which no eyeball check would have called wrong.
   *
   * The continent list is hand-written because the payout registry carries no
   * continent, so it is pinned to the registry below: a market that leaves the
   * registry fails loudly here instead of leaving a dead entry. What this
   * CANNOT catch is a NEW African market being added and not listed — it would
   * simply not be counted, and the guard would quietly weaken. That is the
   * known limit of this assertion, recorded rather than papered over.
   */
  it('does not read as an Africa-only marketplace', () => {
    const AFRICAN = ['NG', 'KE', 'GH', 'ZA']
    for (const code of AFRICAN) expect(PAYOUT_MARKET_CODES).toContain(code)

    const locatedIn = EXAMPLE_TASKS.map((t) => t.country).filter(
      (c): c is string => c !== null,
    )
    const african = locatedIn.filter((c) => AFRICAN.includes(c))
    expect(african.length).toBeLessThan(locatedIn.length / 2)
  })

  /**
   * Titles are sized for the card, against the SAME constant the data file
   * documents. The literal was 45 here while tasks.ts said "~40", so a
   * 44-character title broke the documented rule and passed the guard meant to
   * enforce it. Importing the bound makes that impossible.
   */
  it('keeps every title within the documented card width', () => {
    expect(MAX_TITLE_LENGTH).toBeGreaterThan(0)
    for (const task of EXAMPLE_TASKS) {
      expect(task.title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH)
    }
  })

  /**
   * A title's " · " suffix names a LOCALITY — Lekki Phase 1, Sandton, Deira,
   * BGC, Balogun — or a detail like "2 hours". It must never be the city,
   * because the card renders the title and then the city underneath it: two
   * seeds said "Same-day pharmacy run · Makati" above "🇵🇭 Makati" and
   * "Deliver catering trays · Quezon" above "🇵🇭 Quezon City", printing the
   * same place twice while the other eight rows used the convention properly.
   *
   * The prefix check is what catches the second one: "Quezon" is not equal to
   * "Quezon City", so equality alone would have let it through.
   */
  it('never repeats the city in the title’s suffix', () => {
    const suffixed = EXAMPLE_TASKS.filter((t) => t.title.includes(' · '))
    expect(suffixed.length).toBeGreaterThan(0)
    for (const task of suffixed) {
      const suffix = task.title.split(' · ').at(-1) ?? ''
      expect(suffix).not.toBe('')
      expect(suffix.toLowerCase()).not.toBe(task.city.toLowerCase())
      expect(task.city.toLowerCase().startsWith(suffix.toLowerCase())).toBe(false)
    }
  })
})
