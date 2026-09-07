import { beforeEach, describe, expect, it } from 'vitest'
import { useGigsBrowseStore } from '@/stores/gigs-browse.store'

beforeEach(() => {
  useGigsBrowseStore.setState({ category: null, q: '' })
})

describe('gigs browse store', () => {
  it('starts unnarrowed: every category, no search', () => {
    expect(useGigsBrowseStore.getState().category).toBeNull()
    expect(useGigsBrowseStore.getState().q).toBe('')
  })

  it('holds a category and clears it back to all', () => {
    useGigsBrowseStore.getState().setCategory('photo')
    expect(useGigsBrowseStore.getState().category).toBe('photo')
    useGigsBrowseStore.getState().setCategory(null)
    expect(useGigsBrowseStore.getState().category).toBeNull()
  })

  it('holds a search independently of the category', () => {
    useGigsBrowseStore.getState().setCategory('delivery')
    useGigsBrowseStore.getState().setQ('parcel')
    expect(useGigsBrowseStore.getState()).toMatchObject({ category: 'delivery', q: 'parcel' })
  })
})
