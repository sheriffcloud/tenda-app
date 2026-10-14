/**
 * What the @list/gigs slot renders per view and per selection: the column in
 * list view, nothing in grid view on the bare surface, and the column again
 * once a gig is open — whatever the view.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { resetGigsViewForTests, setGigsView } from '@/lib/gigs/browse-view'

const nav = vi.hoisted(() => ({ pathname: '/gigs' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))
vi.mock('@/components/gigs/OpenGigsListColumn', () => ({
  OpenGigsListColumn: () => <section data-list>column</section>,
}))

import { GigsListSlot } from '@/components/gigs/GigsListSlot'

beforeEach(() => {
  window.localStorage.clear()
  resetGigsViewForTests()
  nav.pathname = '/gigs'
})

it('renders the column in list view', () => {
  render(<GigsListSlot />)
  expect(screen.getByText('column')).toBeInTheDocument()
})

it('renders NOTHING in grid view on the bare surface — the grid takes the whole pane', () => {
  setGigsView('grid')
  const { container } = render(<GigsListSlot />)
  expect(container).toBeEmptyDOMElement()
  expect(container.querySelector('[data-list]')).toBeNull()
})

it('brings the column back beside an open gig, even in grid view', () => {
  setGigsView('grid')
  nav.pathname = '/gigs/gig-delivery-1'
  render(<GigsListSlot />)
  expect(screen.getByText('column')).toBeInTheDocument()
})

it('does not mistake a deeper path for a selection', () => {
  setGigsView('grid')
  nav.pathname = '/gigs/gig-delivery-1/something'
  const { container } = render(<GigsListSlot />)
  expect(container).toBeEmptyDOMElement()
})
