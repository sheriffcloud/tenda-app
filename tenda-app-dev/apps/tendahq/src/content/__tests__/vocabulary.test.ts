import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  SUPPORTED_CURRENCIES as SHARED_CURRENCIES,
  CURRENCY_META,
} from '@tenda/shared/constants/currencies'
import {
  GIG_CATEGORIES as SHARED_CATEGORIES,
  CATEGORY_LABELS,
} from '@tenda/shared/constants/categories'
import { CURRENCIES, SUPPORTED_CURRENCIES } from '../currencies'
import { CATEGORIES, CATEGORY_LABELS_PROSE, GIG_CATEGORIES } from '../categories'
import { LandingPage } from '../../App'

/**
 * The landing kept its OWN copy of both vocabularies, and both had drifted:
 * currencies omitted AED (so the page rendered a display count of 8 for a
 * product supporting 9), and categories labelled `photo` "Photo" where shared
 * deliberately says "Creative", carrying icons a recorded product decision had
 * rejected.
 *
 * A copy cannot be caught by testing the copy — it agrees with itself. These
 * tests are written against SHARED as the authority, so they fail if the
 * landing ever reintroduces a local list, and they are the reason deleting the
 * copies is safe rather than merely tidy.
 */
/** Rendered once: three `it` blocks read it, and it is the whole page. */
const html = renderToStaticMarkup(createElement(LandingPage))

describe('display currencies', () => {
  it('is exactly shared’s vocabulary, in shared’s order', () => {
    expect([...SUPPORTED_CURRENCIES]).toEqual([...SHARED_CURRENCIES])
  })

  /**
   * The specific regression. AED is asserted BY NAME rather than by count,
   * because a count assertion passes again the moment any ninth currency is
   * added — including a wrong one.
   */
  it('includes AED, the currency the deleted copy omitted', () => {
    expect(SUPPORTED_CURRENCIES).toContain('AED')
    expect(CURRENCIES.AED.name).toBe('UAE Dirham')
  })

  it('carries shared’s symbol, name and flag for every currency', () => {
    for (const code of SHARED_CURRENCIES) {
      const shared = CURRENCY_META[code]
      expect(CURRENCIES[code]).toEqual({
        code,
        symbol: shared.symbol,
        name: shared.name,
        flag: shared.flag,
      })
    }
  })

  /**
   * `coingeckoKey` is a server pricing detail, and `locale` is a field nothing
   * on this site reads. Both ride on shared's row, and a spread would have
   * carried them onto every object the marketing page holds while the local
   * interface claimed otherwise. Asserting the EXACT key set is what catches a
   * spread being reintroduced, whichever extra field it drags in.
   */
  it('projects exactly the fields the site renders, and nothing else', () => {
    const rows = Object.values(CURRENCIES)
    expect(rows).toHaveLength(SHARED_CURRENCIES.length)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['code', 'flag', 'name', 'symbol'])
    }
  })
})

describe('gig categories', () => {
  it('is exactly shared’s vocabulary, in shared’s order', () => {
    expect([...GIG_CATEGORIES]).toEqual([...SHARED_CATEGORIES])
  })

  /**
   * The specific regression, asserted on the one category whose label differs
   * from its key. Shared's docstring records why: mobile shipped both "Photo"
   * and "Creative" for this category, and the consolidation ended it. The
   * landing had reopened the split.
   */
  it('labels `photo` "Creative", as shared does — not "Photo"', () => {
    expect(CATEGORIES.photo.label).toBe('Creative')
    expect(CATEGORIES.photo.label).not.toBe('Photo')
  })

  it('takes every label from shared rather than restating it', () => {
    for (const id of SHARED_CATEGORIES) {
      expect(CATEGORIES[id].label).toBe(CATEGORY_LABELS[id])
    }
  })

  /**
   * Emoji is the one thing decided locally, so it is the one thing that can go
   * missing when a category is added to shared. The Record is total, which
   * makes that a compile error — this covers the case where a key exists but
   * was filled in with an empty string.
   */
  it('gives every category a non-empty chip glyph', () => {
    for (const id of SHARED_CATEGORIES) {
      expect(CATEGORIES[id].emoji).not.toBe('')
      expect(CATEGORIES[id].id).toBe(id)
    }
  })

  it('offers the same set as sentence prose, lower-cased and conjoined', () => {
    expect(CATEGORY_LABELS_PROSE).toContain(' and ')
    expect(CATEGORY_LABELS_PROSE).not.toContain(' · ')
    for (const id of SHARED_CATEGORIES) {
      expect(CATEGORY_LABELS_PROSE).toContain(CATEGORY_LABELS[id].toLowerCase())
    }
  })

  /**
   * THE REGRESSION THIS PAIR EXISTS FOR, asserted on the rendered page rather
   * than on the constants.
   *
   * The §03 gigs panel hand-listed its categories in body copy — "delivery,
   * photo, errands, services, digital" — printing the enum key `photo` two
   * lines above a stat line that had just been changed to print shared's label
   * "Creative". One panel, one category, two names. Both constants were
   * correct; only the page was wrong, so only reading the page catches it.
   */
  it('enumerates its categories from the shared labels, on the page', () => {
    expect(html).toContain(CATEGORY_LABELS_PROSE)
    // The category CHIPS under the tasks ticker: one per shared category,
    // carrying shared's label beside the landing's emoji.
    for (const id of SHARED_CATEGORIES) {
      expect(html).toContain(`${CATEGORIES[id].emoji} ${CATEGORY_LABELS[id]}`)
    }
    expect(CATEGORY_LABELS_PROSE).toContain('creative')
  })

  /**
   * A NOTE ON WHAT THIS TEST IS NOT.
   *
   * The first draft hunted the rendered page for the substring ' photo ' and
   * failed — on "Workers submit photo or video proof", which is the ordinary
   * English word and entirely correct copy. That is the same mistake as the
   * earlier 'testnet' check in the networks suite: a substring search cannot
   * tell a category KEY from a common noun that happens to spell it, and the
   * tempting fix both times was to reword honest prose.
   *
   * So the contract asserted above is the positive one — the panel's category
   * list IS the derived string — which cannot be satisfied by a hand-typed
   * list, and cannot fire on unrelated prose.
   */
  it('leaves ordinary uses of the word alone', () => {
    expect(html).toContain('photo or video proof')
  })
})
