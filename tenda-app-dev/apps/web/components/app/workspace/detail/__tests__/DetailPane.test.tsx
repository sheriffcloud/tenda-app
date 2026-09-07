import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DetailEmpty, DetailPane } from '@/components/app/workspace/detail'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DetailPane — structure', () => {
  it('exposes the pane as a named region carrying the CSS hook', () => {
    render(
      <DetailPane label="Escrow detail">
        <p>body</p>
      </DetailPane>,
    )
    const pane = screen.getByRole('region', { name: 'Escrow detail' })
    expect(pane).toHaveAttribute('data-detail')
    expect(pane).toHaveTextContent('body')
  })

  it('is programmatically focusable but stays out of the tab order', () => {
    render(<DetailPane label="Detail">x</DetailPane>)
    expect(screen.getByRole('region', { name: 'Detail' })).toHaveAttribute('tabindex', '-1')
  })

  it('renders no back affordance unless a target is given', () => {
    render(<DetailPane label="Detail">x</DetailPane>)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders a persistent breadcrumb and back link when a target is given', () => {
    render(
      <DetailPane label="Detail" backHref="/messages" backLabel="Back to messages">
        x
      </DetailPane>,
    )
    const back = screen.getByRole('link', { name: /Back to messages/ })
    expect(back).toHaveAttribute('href', '/messages')
    expect(back).toHaveAttribute('data-pane-back')
    expect(screen.getByText('Details')).toBeInTheDocument()
  })
})

describe('DetailPane — focus hand-off', () => {
  it('does NOT steal focus on first mount', () => {
    render(
      <DetailPane label="Detail" selectionKey="a">
        x
      </DetailPane>,
    )
    expect(screen.getByRole('region', { name: 'Detail' })).not.toHaveFocus()
  })

  it('does NOT steal focus on first mount under StrictMode', () => {
    // The app router enables StrictMode by default, which double-invokes
    // mount effects: a "have I mounted" flag flips on the first invocation
    // and lets the second one focus. This is a dev-only path that no
    // non-Strict test can reach.
    render(
      <StrictMode>
        <DetailPane label="Detail" selectionKey="a">
          x
        </DetailPane>
      </StrictMode>,
    )
    expect(screen.getByRole('region', { name: 'Detail' })).not.toHaveFocus()
  })

  it('still hands off focus on a real selection change under StrictMode', () => {
    const { rerender } = render(
      <StrictMode>
        <DetailPane label="Detail" selectionKey="a">
          x
        </DetailPane>
      </StrictMode>,
    )
    rerender(
      <StrictMode>
        <DetailPane label="Detail" selectionKey="b">
          y
        </DetailPane>
      </StrictMode>,
    )
    expect(screen.getByRole('region', { name: 'Detail' })).toHaveFocus()
  })

  it('re-focuses when the reader picks the same row again after clearing', () => {
    const { rerender } = render(
      <DetailPane label="Detail" selectionKey="a">
        x
      </DetailPane>,
    )
    rerender(
      <DetailPane label="Detail" selectionKey={null}>
        nothing
      </DetailPane>,
    )
    ;(document.activeElement as HTMLElement | null)?.blur()
    rerender(
      <DetailPane label="Detail" selectionKey="a">
        x again
      </DetailPane>,
    )
    expect(screen.getByRole('region', { name: 'Detail' })).toHaveFocus()
  })

  it('takes focus when the selection changes', () => {
    const { rerender } = render(
      <DetailPane label="Detail" selectionKey="a">
        x
      </DetailPane>,
    )
    rerender(
      <DetailPane label="Detail" selectionKey="b">
        y
      </DetailPane>,
    )
    expect(screen.getByRole('region', { name: 'Detail' })).toHaveFocus()
  })

  it('does not re-take focus when the same row re-renders', () => {
    const { rerender } = render(
      <DetailPane label="Detail" selectionKey="a">
        x
      </DetailPane>,
    )
    ;(document.activeElement as HTMLElement | null)?.blur()
    rerender(
      <DetailPane label="Detail" selectionKey="a">
        x updated
      </DetailPane>,
    )
    expect(screen.getByRole('region', { name: 'Detail' })).not.toHaveFocus()
  })

  it('does not take focus when the selection clears', () => {
    const { rerender } = render(
      <DetailPane label="Detail" selectionKey="a">
        x
      </DetailPane>,
    )
    rerender(
      <DetailPane label="Detail" selectionKey={null}>
        nothing
      </DetailPane>,
    )
    expect(screen.getByRole('region', { name: 'Detail' })).not.toHaveFocus()
  })

  it('takes focus again on the next real selection after a clear', () => {
    const { rerender } = render(
      <DetailPane label="Detail" selectionKey="a">
        x
      </DetailPane>,
    )
    rerender(
      <DetailPane label="Detail" selectionKey={null}>
        nothing
      </DetailPane>,
    )
    rerender(
      <DetailPane label="Detail" selectionKey="c">
        z
      </DetailPane>,
    )
    expect(screen.getByRole('region', { name: 'Detail' })).toHaveFocus()
  })
})

describe('DetailEmpty', () => {
  it('renders the surface-specific copy', () => {
    render(<DetailEmpty title="Pick a conversation" body="Choose someone on the left." />)
    expect(screen.getByText('Pick a conversation')).toBeInTheDocument()
    expect(screen.getByText('Choose someone on the left.')).toBeInTheDocument()
  })
})
