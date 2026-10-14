/**
 * /gigs with nothing selected picks between the two views: the nothing-
 * selected pane in list view, the whole-pane grid in grid view.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { OPEN_GIGS_COPY } from '@/components/gigs/copy'
import { resetGigsViewForTests, setGigsView } from '@/lib/gigs/browse-view'

vi.mock('@/components/gigs/OpenGigsGrid', () => ({
  OpenGigsGrid: () => <section data-gigs-grid>grid</section>,
}))

import GigsPage from '../page'

beforeEach(() => {
  window.localStorage.clear()
  resetGigsViewForTests()
})

it('list view: the nothing-selected pane, with the words the /home column used', () => {
  render(<GigsPage />)
  expect(screen.getByText(OPEN_GIGS_COPY.emptyDetailTitle)).toBeInTheDocument()
  expect(screen.getByText(OPEN_GIGS_COPY.emptyDetailBody)).toBeInTheDocument()
  expect(screen.queryByText('grid')).toBeNull()
})

it('grid view: the grid takes the pane and the empty pane is gone', () => {
  setGigsView('grid')
  render(<GigsPage />)
  expect(screen.getByText('grid')).toBeInTheDocument()
  expect(screen.queryByText(OPEN_GIGS_COPY.emptyDetailTitle)).toBeNull()
})
