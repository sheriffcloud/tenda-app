import { vi } from 'vitest'

vi.mock('@/api/client', () => ({
  api: { gigs: { list: vi.fn(), get: vi.fn(), facets: vi.fn() }, platform: { chains: vi.fn(), config: vi.fn() } },
}))

import { ApiClientError, LOCATIONS, type GigFacets } from '@tenda/shared'
import { api } from '@/api/client'
import {
  getGig,
  listEnabledChains,
  listGigFacetsOnce,
  listGigs,
  listGigsOnce,
  readPlatformConfigOnce,
} from '@/lib/gigs/data'

describe('readPlatformConfigOnce — the fee on the feed heading', () => {
  it('returns the live config on success', async () => {
    vi.mocked(api.platform.config).mockResolvedValue({ fee_bps: 250, seeker_fee_bps: 100, grace_period_seconds: 3600 })
    expect(await readPlatformConfigOnce()).toMatchObject({ fee_bps: 250 })
  })

  it('answers null when the read fails, so the heading omits the fee rather than printing static copy', async () => {
    vi.mocked(api.platform.config).mockRejectedValue(new ApiClientError(500, 'Internal', 'boom'))
    expect(await readPlatformConfigOnce()).toBeNull()
  })

  it('answers null for a 200 of the wrong shape', async () => {
    vi.mocked(api.platform.config).mockResolvedValue({ hello: 'world' } as never)
    expect(await readPlatformConfigOnce()).toBeNull()
    vi.mocked(api.platform.config).mockResolvedValue(undefined as never)
    expect(await readPlatformConfigOnce()).toBeNull()
  })
})

const gigsApi = vi.mocked(api.gigs)
const platformApi = vi.mocked(api.platform)

describe('listGigs', () => {
  it('passes the query through to the anonymous client', async () => {
    gigsApi.list.mockResolvedValue({ data: [], total: 0, limit: 20, offset: 0 })
    await listGigs({ category: 'delivery', limit: 20 })
    expect(gigsApi.list).toHaveBeenCalledWith({ category: 'delivery', limit: 20 })
  })
})

describe('listGigsOnce — the read the PAGE uses', () => {
  const page = { data: [], total: 0, limit: 20, offset: 0 }

  it('returns the page on success, query intact', async () => {
    gigsApi.list.mockResolvedValue(page)
    expect(await listGigsOnce({ category: 'delivery', limit: 20 })).toBe(page)
    expect(gigsApi.list).toHaveBeenCalledWith({ category: 'delivery', limit: 20 })
  })

  it('answers NULL rather than throwing when the index is down', async () => {
    // A throw would land on the route error boundary — a client component,
    // whose fallback needs JavaScript. Null lets the page render the honest
    // state server-side instead.
    gigsApi.list.mockRejectedValue(new ApiClientError(500, 'Internal', 'boom'))
    expect(await listGigsOnce({ limit: 20 })).toBeNull()
  })

  it('answers null for a 200 carrying the WRONG SHAPE', async () => {
    // A proxy's own JSON, or a stale NEXT_PUBLIC_API_URL. Without this guard
    // `page.data.map` throws inside the render, which is the same blank page
    // by a different route.
    gigsApi.list.mockResolvedValue({ hello: 'world' } as never)
    expect(await listGigsOnce({ limit: 20 })).toBeNull()

    gigsApi.list.mockResolvedValue(undefined as never)
    expect(await listGigsOnce({ limit: 20 })).toBeNull()
  })

  it('rebuilds the query faithfully from its cache key', async () => {
    // The key is the SERIALISED query because `cache()` keys on argument
    // identity and the page and its metadata each build their own object. So
    // the round trip through JSON has to preserve the query exactly, including
    // a filter whose value is a CAIP-2 id with a colon in it.
    //
    // The dedupe itself is a Next-runtime property (React `cache()` needs a
    // request scope, which vitest does not provide) and so is NOT asserted
    // here — it is measured against a running server instead: one page load,
    // one `/v1/gigs` hit. See the note in data.ts.
    gigsApi.list.mockResolvedValue(page)
    const query = { category: 'photo', chain_id: 'eip155:84532', q: 'a b', limit: 20 } as const
    await listGigsOnce(query)
    expect(gigsApi.list).toHaveBeenCalledWith(query)
  })

  it('keeps two DIFFERENT queries apart', async () => {
    gigsApi.list.mockResolvedValue(page)
    await listGigsOnce({ category: 'delivery', limit: 20 })
    await listGigsOnce({ category: 'photo', limit: 20 })
    expect(gigsApi.list).toHaveBeenNthCalledWith(1, { category: 'delivery', limit: 20 })
    expect(gigsApi.list).toHaveBeenNthCalledWith(2, { category: 'photo', limit: 20 })
  })
})

describe('getGig', () => {
  it('returns the detail on success', async () => {
    const detail = { escrow_id: 'gig-1', title: 'Deliver a parcel' }
    gigsApi.get.mockResolvedValue(detail as never)
    expect(await getGig('gig-1')).toBe(detail)
    expect(gigsApi.get).toHaveBeenCalledWith({ id: 'gig-1' })
  })

  it('maps a 404 (unknown OR hidden gig) to null for notFound()', async () => {
    gigsApi.get.mockRejectedValue(new ApiClientError(404, 'Not Found', 'no such gig'))
    expect(await getGig('hidden-gig')).toBeNull()
  })

  it('rethrows non-404 failures — an API outage is not a 404 page', async () => {
    gigsApi.get.mockRejectedValue(new ApiClientError(500, 'Internal', 'boom'))
    await expect(getGig('gig-err')).rejects.toMatchObject({ statusCode: 500 })
  })
})

describe('listEnabledChains', () => {
  it('maps the running registry to filter options', async () => {
    platformApi.chains.mockResolvedValue({
      data: [
        {
          id: 'solana:devnet',
          namespace: 'solana',
          display_name: 'Solana Devnet',
          escrow_address: 'Escrw1',
          assets: [],
        },
      ],
    })
    expect(await listEnabledChains()).toEqual([{ id: 'solana:devnet', label: 'Solana Devnet' }])
  })

  it('degrades to no options when the registry read fails — never a 400-able filter', async () => {
    platformApi.chains.mockRejectedValue(new ApiClientError(500, 'Internal', 'down'))
    expect(await listEnabledChains()).toEqual([])
  })
})

describe('listGigFacetsOnce — the rail counts', () => {
  const facets: GigFacets = {
    category: { delivery: 1, photo: 0, errand: 0, service: 0, digital: 0 },
    // Complete over the shared vocabulary, as the wire type requires.
    country: {
      ...(Object.fromEntries(Object.keys(LOCATIONS).map((c) => [c, 0])) as GigFacets['country']),
      NG: 1,
    },
    remote: 0,
    cross_border: 0,
  }

  it('returns the counts on success, query intact', async () => {
    gigsApi.facets.mockResolvedValue(facets)
    expect(await listGigFacetsOnce({ category: 'delivery' })).toBe(facets)
    expect(gigsApi.facets).toHaveBeenCalledWith({ category: 'delivery' })
  })

  it('answers NULL when the aggregate fails, so the feed still renders', async () => {
    // The counts are an enhancement. Letting this throw would trade the page's
    // primary content for a decoration that could not be drawn.
    gigsApi.facets.mockRejectedValue(new ApiClientError(500, 'Internal', 'boom'))
    expect(await listGigFacetsOnce({})).toBeNull()
  })

  it('answers null for a 200 carrying the WRONG SHAPE', async () => {
    // Same trap as the feed read: `facets.category[key]` inside the render
    // would throw and blank the page for a reader with no JavaScript.
    // The cast is the POINT: this test exists for a server that answers with
    // a shape the type says is impossible, which is the only way that bug
    // reaches production. It cannot be written without escaping the type.
    gigsApi.facets.mockResolvedValue({ ok: true } as unknown as GigFacets)
    expect(await listGigFacetsOnce({ q: 'wrong-shape' })).toBeNull()
  })

  it('answers null when category is present but NOT an object', async () => {
    gigsApi.facets.mockResolvedValue({
      category: null,
      country: {},
      remote: 0,
      cross_border: 0,
    } as unknown as GigFacets)
    expect(await listGigFacetsOnce({ q: 'null-category' })).toBeNull()
  })
})
