/**
 * URL-param parsing for the public feed. The load-bearing behavior: invalid
 * values are DROPPED (the server 400s unknown chain/category rather than
 * returning an empty page), hrefs keep filters linkable, and the two paging
 * modes never appear on the wire together.
 */
import {
  GIGS_PAGE_SIZE,
  GIG_MARKETS,
  GIG_SORTS,
  GIG_SORT_LABELS,
  gigsHref,
  hasActiveFilters,
  parseGigFeedFilters as parse,
  toGigFacetsQuery,
  toGigListQuery,
  usesCursorPaging,
  type RawSearchParams,
} from '@/lib/gigs/search-params'

// The running registry as the page resolves it (listEnabledChains) — dev chains.
const ENABLED = new Set(['solana:devnet', 'eip155:84532'])
const parseGigFeedFilters = (params: RawSearchParams) => parse(params, ENABLED)

describe('parseGigFeedFilters', () => {
  it('accepts valid values', () => {
    const filters = parseGigFeedFilters({
      category: 'delivery',
      country: 'NG',
      city: 'Lagos',
      chain_id: 'solana:devnet',
      remote: 'true',
      cross_border: 'true',
      q: 'urgent',
      sort: 'amount_desc',
      cursor: 'abc',
      offset: '40',
    })
    expect(filters).toEqual({
      category: 'delivery',
      country: 'NG',
      city: 'Lagos',
      chain_id: 'solana:devnet',
      remote: true,
      cross_border: true,
      q: 'urgent',
      sort: 'amount_desc',
      cursor: 'abc',
      offset: 40,
    })
  })

  it('drops unknown categories and chain ids instead of forwarding a 400', () => {
    const filters = parseGigFeedFilters({ category: 'plumbing', chain_id: 'eip155:999999' })
    expect(filters.category).toBeNull()
    expect(filters.chain_id).toBeNull()
  })

  it('drops a country outside the shared vocabulary — the server 400s it', () => {
    expect(parseGigFeedFilters({ country: 'ZZ' }).country).toBeNull()
    expect(parseGigFeedFilters({ country: 'ng' }).country).toBeNull() // codes are upper-case
  })

  it('every offered market is one the server accepts', () => {
    for (const market of GIG_MARKETS) {
      expect(parseGigFeedFilters({ country: market }).country).toBe(market)
    }
  })

  it('drops a MANIFEST chain the running registry does not serve — the 400 the server would throw', () => {
    // solana:mainnet is real in CHAIN_MANIFEST but not provisioned on this
    // deployment; forwarding it turns a filter click into an error page.
    expect(parseGigFeedFilters({ chain_id: 'solana:mainnet' }).chain_id).toBeNull()
  })

  it('treats empty and whitespace values as absent', () => {
    const filters = parseGigFeedFilters({ city: '  ', q: '', cursor: undefined })
    expect(filters.city).toBeNull()
    expect(filters.q).toBeNull()
    expect(filters.cursor).toBeNull()
  })

  it('takes the first value of a repeated param', () => {
    expect(parseGigFeedFilters({ category: ['photo', 'errand'] }).category).toBe('photo')
  })

  it('remote and cross_border are only true for the literal "true"', () => {
    expect(parseGigFeedFilters({ remote: '1', cross_border: 'yes' }).remote).toBe(false)
    expect(parseGigFeedFilters({ cross_border: 'yes' }).cross_border).toBe(false)
    expect(parseGigFeedFilters({}).remote).toBe(false)
  })

  it('falls back to recency for an unknown sort', () => {
    expect(parseGigFeedFilters({ sort: 'relevance' }).sort).toBe('created_at')
    expect(parseGigFeedFilters({}).sort).toBe('created_at')
  })

  it('accepts every sort the rail offers', () => {
    for (const sort of GIG_SORTS) {
      expect(parseGigFeedFilters({ sort }).sort).toBe(sort)
      expect(GIG_SORT_LABELS[sort]).not.toBe('')
    }
  })

  it('a junk, negative or fractional offset is page one, never a wrong page', () => {
    expect(parseGigFeedFilters({ offset: 'abc' }).offset).toBe(0)
    expect(parseGigFeedFilters({ offset: '-20' }).offset).toBe(0)
    expect(parseGigFeedFilters({ offset: '2.5' }).offset).toBe(0)
    expect(parseGigFeedFilters({ offset: '1e400' }).offset).toBe(0)
    expect(parseGigFeedFilters({}).offset).toBe(0)
  })
})

describe('usesCursorPaging', () => {
  it('is true only for the plain recency feed the server mints cursors for', () => {
    expect(usesCursorPaging(parseGigFeedFilters({}))).toBe(true)
    expect(usesCursorPaging(parseGigFeedFilters({ category: 'photo' }))).toBe(true)
    expect(usesCursorPaging(parseGigFeedFilters({ q: 'urgent' }))).toBe(false)
    expect(usesCursorPaging(parseGigFeedFilters({ sort: 'amount_asc' }))).toBe(false)
  })
})

describe('toGigListQuery', () => {
  it('maps set filters and omits unset ones', () => {
    const query = toGigListQuery(parseGigFeedFilters({ category: 'service', remote: 'true' }))
    expect(query).toEqual({
      category: 'service',
      country: undefined,
      city: undefined,
      chain_id: undefined,
      remote: true,
      cross_border: undefined,
      q: undefined,
      sort: undefined,
      cursor: undefined,
      offset: undefined,
      limit: GIGS_PAGE_SIZE,
    })
  })

  it('never sends a cursor and an offset together — that pairing is a 400', () => {
    const cursored = toGigListQuery(parseGigFeedFilters({ cursor: 'abc', offset: '40' }))
    expect(cursored.cursor).toBe('abc')
    expect(cursored.offset).toBeUndefined()

    const searched = toGigListQuery(parseGigFeedFilters({ q: 'tiler', cursor: 'abc', offset: '40' }))
    expect(searched.cursor).toBeUndefined()
    expect(searched.offset).toBe(40)
  })

  it('drops a cursor carried into a SORTED view — the server 400s that pair', () => {
    const query = toGigListQuery(parseGigFeedFilters({ sort: 'amount_desc', cursor: 'abc' }))
    expect(query.cursor).toBeUndefined()
    expect(query.sort).toBe('amount_desc')
  })

  it('omits the default ordering so the recency feed keeps its cursor', () => {
    // Sending sort=created_at is behaviourally identical BUT opts the response
    // out of next_cursor server-side, which would strand the feed on page one.
    expect(toGigListQuery(parseGigFeedFilters({ sort: 'created_at' })).sort).toBeUndefined()
  })
})

describe('hasActiveFilters', () => {
  it('is false for the bare feed and true for any narrowing', () => {
    expect(hasActiveFilters(parseGigFeedFilters({}))).toBe(false)
    expect(hasActiveFilters(parseGigFeedFilters({ cursor: 'abc', offset: '40' }))).toBe(false)
    for (const params of [
      { category: 'photo' },
      { country: 'KE' },
      { city: 'Lagos' },
      { chain_id: 'solana:devnet' },
      { remote: 'true' },
      { cross_border: 'true' },
      { q: 'tiler' },
      { sort: 'amount_asc' },
    ]) {
      expect(hasActiveFilters(parseGigFeedFilters(params))).toBe(true)
    }
  })
})

describe('gigsHref', () => {
  const base = parseGigFeedFilters({ category: 'delivery', city: 'Lagos' })

  it('keeps existing filters and applies changes', () => {
    expect(gigsHref(base, { category: 'photo' })).toBe('/?category=photo&city=Lagos')
  })

  it('null clears a key; a fully cleared set is the bare path', () => {
    expect(gigsHref(base, { category: null, city: null })).toBe('/')
  })

  it('carries every filter the URL contract owns', () => {
    const all = parseGigFeedFilters({
      category: 'photo',
      country: 'GH',
      city: 'Accra',
      chain_id: 'eip155:84532',
      remote: 'true',
      cross_border: 'true',
      q: 'shoot',
      sort: 'amount_asc',
    })
    const href = gigsHref(all)
    for (const expected of [
      'category=photo',
      'country=GH',
      'city=Accra',
      'chain_id=eip155%3A84532',
      'remote=true',
      'cross_border=true',
      'q=shoot',
      'sort=amount_asc',
    ]) {
      expect(href).toContain(expected)
    }
  })

  it('leaves the default ordering out of the URL — one canonical feed address', () => {
    expect(gigsHref(parseGigFeedFilters({ sort: 'created_at' }))).toBe('/')
    expect(gigsHref(base, { sort: null })).not.toContain('sort')
  })

  it('drops BOTH position keys on a filter change but carries them when passed', () => {
    const positioned = parseGigFeedFilters({ category: 'delivery', cursor: 'page2', offset: '40' })
    expect(gigsHref(positioned, { category: 'photo' })).not.toContain('cursor')
    expect(gigsHref(positioned, { category: 'photo' })).not.toContain('offset')
    expect(gigsHref(positioned, { cursor: 'page3' })).toContain('cursor=page3')
    expect(gigsHref(positioned, { offset: '60' })).toContain('offset=60')
  })
})

describe('toGigFacetsQuery', () => {
  it('carries every NARROWING filter', () => {
    const filters = parse(
      { category: 'photo', country: 'NG', city: 'Lagos', remote: 'true', cross_border: 'true', q: 'tiler' },
      new Set<string>(),
    )
    expect(toGigFacetsQuery(filters)).toEqual({
      category: 'photo',
      country: 'NG',
      city: 'Lagos',
      chain_id: undefined,
      remote: true,
      cross_border: true,
      q: 'tiler',
    })
  })

  it('carries NOTHING about position or ordering', () => {
    // Paging picks which page of the same set comes back and `sort` picks its
    // order; neither can change a count. Sending them would also make two
    // identical rails cache-miss each other.
    const filters = parse({ offset: '40', sort: 'amount_desc', cursor: 'abc' }, new Set<string>())
    const keys = Object.keys(toGigFacetsQuery(filters))
    for (const key of ['sort', 'limit', 'offset', 'cursor']) {
      expect(keys).not.toContain(key)
    }
  })

  it('is the HEAD of the list query, key for key', () => {
    // The list query spreads this first, and that shared order is what keeps
    // the two reads describing the same view (and keeps data.ts's cache key
    // stable). Asserted rather than assumed, because a reordering is invisible.
    const filters = parse({ category: 'photo', country: 'NG' }, new Set<string>())
    const facetKeys = Object.keys(toGigFacetsQuery(filters))
    expect(Object.keys(toGigListQuery(filters)).slice(0, facetKeys.length)).toEqual(facetKeys)
  })
})
