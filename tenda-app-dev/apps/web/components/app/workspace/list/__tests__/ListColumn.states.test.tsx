import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LIST_ERROR_COPY } from '@/components/app/workspace/list'
import { COPY, grouped, renderList, rows } from './list-harness'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ListColumn — async states are mutually exclusive', () => {
  it('shows only the skeleton while loading', () => {
    renderList({ isLoading: true })
    expect(screen.queryByText('Row a')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(COPY.emptyTitle)).not.toBeInTheDocument()
  })

  it('shows the error alert, not the rows, on failure', () => {
    renderList({ error: 'ESCROW_READ_FAILED' })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText(LIST_ERROR_COPY.title)).toBeInTheDocument()
    expect(within(alert).getByText(LIST_ERROR_COPY.body)).toBeInTheDocument()
    expect(within(alert).getByText('ESCROW_READ_FAILED')).toBeInTheDocument()
    expect(screen.queryByText('Row a')).not.toBeInTheDocument()
  })

  it('prefers the skeleton over the error while a retry is in flight', () => {
    renderList({ isLoading: true, error: 'BOOM' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the surface-specific empty copy when there are no rows', () => {
    renderList({ groups: [] })
    expect(screen.getByText(COPY.emptyTitle)).toBeInTheDocument()
    expect(screen.getByText(COPY.emptyBody)).toBeInTheDocument()
  })

  it('treats groups that exist but hold no rows as empty', () => {
    renderList({ groups: [{ key: 'g', label: 'Today', rows: [] }] })
    expect(screen.getByText(COPY.emptyTitle)).toBeInTheDocument()
  })

  it('renders rows once loaded', () => {
    renderList()
    for (const t of ['Row a', 'Row b', 'Row c']) expect(screen.getByText(t)).toBeInTheDocument()
  })
})

describe('ListColumn — header', () => {
  it('names the region by its title', () => {
    renderList()
    expect(screen.getByRole('region', { name: COPY.title })).toBeInTheDocument()
  })

  it('carries the data-list hook the ≤900px pane collapse keys off', () => {
    // Without this attribute the single-pane breakpoint cannot hide the list,
    // and both panes stack on a narrow viewport.
    renderList()
    expect(screen.getByRole('region', { name: COPY.title })).toHaveAttribute('data-list')
  })

  it('renders tabs with counts and marks the current one', () => {
    renderList({
      tabs: [
        { href: '/a', label: 'Created', count: 4, current: true },
        { href: '/b', label: 'Working', count: 0 },
      ],
    })
    const created = screen.getByRole('link', { name: /Created/ })
    expect(created).toHaveAttribute('aria-current', 'page')
    expect(created).toHaveTextContent('4')
    expect(screen.getByRole('link', { name: /Working/ })).not.toHaveAttribute('aria-current')
  })

  it('renders a zero tab count rather than hiding it', () => {
    renderList({ tabs: [{ href: '/b', label: 'Working', count: 0 }] })
    expect(screen.getByRole('link', { name: /Working/ })).toHaveTextContent('0')
  })

  it('hides the palette button when no handler is given', () => {
    renderList()
    expect(screen.queryByRole('button', { name: 'Open command palette' })).not.toBeInTheDocument()
  })

  it('calls the palette handler when the affordance is used', async () => {
    const onOpenPalette = vi.fn()
    renderList({ onOpenPalette })
    await userEvent.click(screen.getByRole('button', { name: 'Open command palette' }))
    expect(onOpenPalette).toHaveBeenCalledOnce()
  })

  it('shows the count line only when provided', () => {
    const { unmount } = renderList({ countLabel: '12 open' })
    expect(screen.getByText('12 open')).toBeInTheDocument()
    unmount()
    renderList()
    expect(screen.queryByText('12 open')).not.toBeInTheDocument()
  })

  it('renders the tools beside the title and the filters under it, inside the header (#60)', () => {
    renderList({
      tools: <button type="button">toggle</button>,
      filters: <input aria-label="Search" />,
    })
    const header = screen.getByRole('heading', { name: COPY.title }).closest('header')
    expect(header).not.toBeNull()
    expect(header).toContainElement(screen.getByRole('button', { name: 'toggle' }))
    expect(header).toContainElement(screen.getByRole('textbox', { name: 'Search' }))
    // Order: the title row (with the tool) precedes the filters.
    const nodes = Array.from(header?.querySelectorAll('button, input') ?? [])
    expect(nodes.map((node) => node.tagName)).toEqual(['BUTTON', 'INPUT'])
  })

  it('renders no slot furniture when neither tools nor filters are given', () => {
    renderList()
    const header = screen.getByRole('heading', { name: COPY.title }).closest('header')
    expect(header?.querySelectorAll('button, input')).toHaveLength(0)
  })
})

describe('ListColumn — grouping', () => {
  it('renders group labels above their rows', () => {
    renderList({ groups: grouped(['Today', ['a']], ['Yesterday', ['b']]) })
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
  })

  it('renders an unlabelled group without a heading', () => {
    renderList({ groups: [{ key: 'flat', rows: rows('a') }] })
    expect(screen.getByText('Row a')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
