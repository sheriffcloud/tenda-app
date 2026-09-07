/**
 * The three controls the column head and the grid toolbar share: the view
 * toggle over the remembered preference, the category chips and the search
 * field over the browse store.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATEGORY_LABELS, GIG_CATEGORIES } from '@tenda/shared'
import { CategoryChips } from '@/components/gigs/CategoryChips'
import { GIGS_SEARCH_DEBOUNCE_MS, GigsSearchField } from '@/components/gigs/GigsSearchField'
import { GigsViewToggle } from '@/components/gigs/GigsViewToggle'
import { OPEN_GIGS_COPY } from '@/components/gigs/copy'
import { FEED_COPY } from '@/components/gig/feed/copy'
import { resetGigsViewForTests, setGigsView } from '@/lib/gigs/browse-view'
import { useGigsBrowseStore } from '@/stores/gigs-browse.store'

beforeEach(() => {
  window.localStorage.clear()
  resetGigsViewForTests()
  useGigsBrowseStore.setState({ category: null, q: '' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GigsViewToggle', () => {
  it('is a named group of two pressed-state buttons, list pressed by default', () => {
    render(<GigsViewToggle />)
    const group = screen.getByRole('group', { name: OPEN_GIGS_COPY.view.group })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('button', { name: OPEN_GIGS_COPY.view.list })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: OPEN_GIGS_COPY.view.grid })).toHaveAttribute('aria-pressed', 'false')
  })

  it('pressing grid flips the preference every reader of it sees', async () => {
    render(<GigsViewToggle />)
    await userEvent.click(screen.getByRole('button', { name: OPEN_GIGS_COPY.view.grid }))
    expect(screen.getByRole('button', { name: OPEN_GIGS_COPY.view.grid })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: OPEN_GIGS_COPY.view.list })).toHaveAttribute('aria-pressed', 'false')
    expect(window.localStorage.getItem('tenda:gigs-view')).toBe('grid')
  })

  it('compact keeps the label as the accessible name while hiding its text', () => {
    render(<GigsViewToggle compact />)
    const grid = screen.getByRole('button', { name: OPEN_GIGS_COPY.view.grid })
    expect(grid.textContent).toBe('')
    expect(grid).toHaveAttribute('title', OPEN_GIGS_COPY.view.grid)
  })

  it('reflects a change made elsewhere', () => {
    render(<GigsViewToggle />)
    act(() => {
      setGigsView('grid')
    })
    expect(screen.getByRole('button', { name: OPEN_GIGS_COPY.view.grid })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('CategoryChips', () => {
  it('offers All plus every category in the shared vocabulary, All pressed', () => {
    render(<CategoryChips />)
    const group = screen.getByRole('group', { name: OPEN_GIGS_COPY.categoryGroup })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('button', { name: OPEN_GIGS_COPY.allCategories })).toHaveAttribute('aria-pressed', 'true')
    for (const key of GIG_CATEGORIES) {
      expect(screen.getByRole('button', { name: CATEGORY_LABELS[key] })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('pressing a category narrows the store; pressing All clears it', async () => {
    render(<CategoryChips />)
    await userEvent.click(screen.getByRole('button', { name: CATEGORY_LABELS.photo }))
    expect(useGigsBrowseStore.getState().category).toBe('photo')
    expect(screen.getByRole('button', { name: CATEGORY_LABELS.photo })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: OPEN_GIGS_COPY.allCategories })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: OPEN_GIGS_COPY.allCategories }))
    expect(useGigsBrowseStore.getState().category).toBeNull()
  })
})

describe('GigsSearchField', () => {
  it('uses the feed’s placeholder — the index searches title and brief only', () => {
    render(<GigsSearchField />)
    expect(screen.getByRole('searchbox', { name: FEED_COPY.rail.search })).toHaveAttribute(
      'placeholder',
      FEED_COPY.rail.searchPlaceholder,
    )
  })

  it('debounces typing into the store, trimmed, and not before the delay', () => {
    vi.useFakeTimers()
    render(<GigsSearchField />)
    const box = screen.getByRole('searchbox')
    fireEvent.change(box, { target: { value: 'par' } })
    fireEvent.change(box, { target: { value: ' parcel ' } })
    act(() => {
      vi.advanceTimersByTime(GIGS_SEARCH_DEBOUNCE_MS - 1)
    })
    expect(useGigsBrowseStore.getState().q).toBe('')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(useGigsBrowseStore.getState().q).toBe('parcel')
  })

  it('seeds itself from the store, so a remount does not blank the search', () => {
    useGigsBrowseStore.setState({ q: 'parcel' })
    render(<GigsSearchField />)
    expect(screen.getByRole('searchbox')).toHaveValue('parcel')
  })
})
