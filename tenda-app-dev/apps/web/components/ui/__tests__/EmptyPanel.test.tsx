/**
 * The empty panel's contract, and the one thing it must NOT be: an alert. A
 * filter that matched nothing is not a failure, and `role="alert"` would
 * interrupt a reader to tell them their search was too narrow.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Link from 'next/link'
import { EmptyPanel } from '@/components/ui/EmptyPanel'

describe('EmptyPanel', () => {
  it('names the situation and explains it, without announcing an alert', () => {
    render(<EmptyPanel title="No offers yet" body="Nobody is quoting this pair." />)
    expect(screen.getByRole('heading', { name: 'No offers yet' })).toBeInTheDocument()
    expect(screen.getByText('Nobody is quoting this pair.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('hides a decorative glyph from assistive tech', () => {
    const { container } = render(
      <EmptyPanel title="t" body="b" icon={<svg data-testid="glyph" />} />,
    )
    expect(container.querySelector('[aria-hidden="true"]')).toContainElement(
      screen.getByTestId('glyph'),
    )
  })

  it('renders an action only when there is one', () => {
    const { rerender } = render(<EmptyPanel title="t" body="b" />)
    expect(screen.queryByRole('link')).toBeNull()
    rerender(<EmptyPanel title="t" body="b" action={<Link href="/">Clear filters</Link>} />)
    expect(screen.getByRole('link', { name: 'Clear filters' })).toBeInTheDocument()
  })
})
