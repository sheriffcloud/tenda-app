import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListColumn } from '@/components/app/workspace/list'
import { COPY, grouped, renderList, rows, router, type Row } from './list-harness'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ListColumn — keyboard cursor', () => {
  it('starts with no row active, so the first press selects the first row', async () => {
    renderList()
    expect(screen.getByText('Row a')).toHaveAttribute('data-active', 'false')
    await userEvent.keyboard('j')
    expect(screen.getByText('Row a')).toHaveAttribute('data-active', 'true')
  })

  it('moves down with j and up with k across the whole flat run', async () => {
    renderList({ groups: grouped(['Today', ['a']], ['Yesterday', ['b', 'c']]) })
    await userEvent.keyboard('jj')
    // Crossed a group boundary — the cursor indexes rows, not groups.
    expect(screen.getByText('Row b')).toHaveAttribute('data-active', 'true')
    await userEvent.keyboard('k')
    expect(screen.getByText('Row a')).toHaveAttribute('data-active', 'true')
  })

  it('clamps at the end instead of wrapping to the top', async () => {
    renderList()
    // 4 presses over 3 rows: clamping parks on the last row, wrapping lands
    // back on the first. Press counts that are a multiple of the row count
    // agree under both and prove nothing.
    await userEvent.keyboard('jjjj')
    expect(screen.getByText('Row c')).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('Row a')).toHaveAttribute('data-active', 'false')
  })

  it('clamps at the start instead of wrapping to the bottom', async () => {
    renderList()
    await userEvent.keyboard('jj') // → Row b
    await userEvent.keyboard('kkk') // one more k than there is room for
    expect(screen.getByText('Row a')).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('Row c')).toHaveAttribute('data-active', 'false')
  })

  it('opens the active row on Enter', async () => {
    renderList()
    await userEvent.keyboard('jj')
    await userEvent.keyboard('{Enter}')
    expect(router.push).toHaveBeenCalledWith('/messages/b')
  })

  it('ignores Enter while nothing is active', async () => {
    renderList()
    await userEvent.keyboard('{Enter}')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('does not steal keys while the user is typing in a field', async () => {
    renderList()
    render(<input aria-label="search" />)
    const input = screen.getByLabelText('search')
    await userEvent.click(input)
    await userEvent.type(input, 'jk')
    expect(input).toHaveValue('jk')
    expect(screen.getByText('Row a')).toHaveAttribute('data-active', 'false')
  })

  it('does not hijack a modifier chord such as the palette shortcut', async () => {
    renderList()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(screen.getByText('Row a')).toHaveAttribute('data-active', 'false')
  })

  it('is inert while loading', async () => {
    renderList({ isLoading: true })
    await userEvent.keyboard('j{Enter}')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('is inert on the error state', async () => {
    renderList({ error: 'BOOM' })
    await userEvent.keyboard('j{Enter}')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('pulls the cursor back in when the list shrinks under it', async () => {
    const props = {
      copy: COPY,
      keyOf: (r: Row) => r.id,
      hrefOf: (r: Row) => `/messages/${r.id}`,
      renderRow: (r: Row, { active }: { active: boolean }) => (
        <a href={`/messages/${r.id}`} data-active={active}>
          {r.title}
        </a>
      ),
    }
    const { rerender } = render(
      <ListColumn<Row> {...props} groups={[{ key: 'all', rows: rows('a', 'b', 'c') }]} />,
    )
    await userEvent.keyboard('jjj') // park on the last row
    expect(screen.getByText('Row c')).toHaveAttribute('data-active', 'true')

    // A refresh drops the list to one row; the cursor must not stay at 2.
    rerender(<ListColumn<Row> {...props} groups={[{ key: 'all', rows: rows('a') }]} />)
    expect(screen.getByText('Row a')).toHaveAttribute('data-active', 'true')

    await userEvent.keyboard('{Enter}')
    expect(router.push).toHaveBeenCalledWith('/messages/a')
  })

  it('drops the cursor entirely when the list empties', async () => {
    const props = {
      copy: COPY,
      keyOf: (r: Row) => r.id,
      hrefOf: (r: Row) => `/messages/${r.id}`,
      renderRow: (r: Row) => <a href={`/messages/${r.id}`}>{r.title}</a>,
    }
    const { rerender } = render(
      <ListColumn<Row> {...props} groups={[{ key: 'all', rows: rows('a', 'b') }]} />,
    )
    await userEvent.keyboard('jj')
    rerender(<ListColumn<Row> {...props} groups={[]} />)
    await userEvent.keyboard('{Enter}')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('leaves Enter to a focused control instead of hijacking it', async () => {
    // Regression: the list's preventDefault() used to CANCEL the button's own
    // activation, so the palette stayed shut AND the list navigated.
    const onOpenPalette = vi.fn()
    renderList({ onOpenPalette })
    await userEvent.keyboard('j')
    screen.getByRole('button', { name: 'Open command palette' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onOpenPalette).toHaveBeenCalledOnce()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('leaves Enter to a focused row link, so the reader opens the row they tabbed to', async () => {
    // Regression: Enter on the focused link used to navigate to the CURSOR's
    // row instead — silently the wrong escrow.
    renderList()
    await userEvent.keyboard('j') // cursor on Row a
    screen.getByText('Row b').focus()
    await userEvent.keyboard('{Enter}')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('still moves the cursor with j/k while a control has focus', async () => {
    // Only Enter defers — j and k are not activation keys.
    renderList({ onOpenPalette: vi.fn() })
    screen.getByRole('button', { name: 'Open command palette' }).focus()
    await userEvent.keyboard('jj')
    expect(screen.getByText('Row b')).toHaveAttribute('data-active', 'true')
  })

  it('activates a row on hover so pointer and keyboard agree', async () => {
    renderList()
    await userEvent.hover(screen.getByText('Row b'))
    expect(screen.getByText('Row b')).toHaveAttribute('data-active', 'true')
    // …and Enter then opens the hovered row.
    await userEvent.keyboard('{Enter}')
    expect(router.push).toHaveBeenCalledWith('/messages/b')
  })
})
