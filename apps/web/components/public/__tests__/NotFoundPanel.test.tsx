/**
 * The 404. Two callers share it — the generic one and the taken-down gig —
 * so the properties worth pinning are the ones a caller could get wrong.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotFoundPanel } from '@/components/public/NotFoundPanel'

describe('NotFoundPanel', () => {
  it('states the code, the situation and what to do about it', () => {
    render(<NotFoundPanel code="404" heading="Nothing here" body="It may have moved." />)
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Nothing here' })).toBeInTheDocument()
    expect(screen.getByText('It may have moved.')).toBeInTheDocument()
  })

  it('always offers TWO ways out — the feed and support', () => {
    // A dead end is the failure mode of a 404, so neither link is optional.
    render(<NotFoundPanel code="404" heading="h" body="b" />)
    expect(screen.getByRole('link', { name: 'Browse open gigs' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Get support' })).toHaveAttribute('href', '/support')
  })

  it('lets a caller replace the primary way out without losing support', () => {
    render(
      <NotFoundPanel
        code="404"
        heading="h"
        body="b"
        action={{ href: '/exchange', label: 'Browse offers' }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Browse offers' })).toHaveAttribute('href', '/exchange')
    expect(screen.queryByRole('link', { name: 'Browse open gigs' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get support' })).toBeInTheDocument()
  })

  it('does NOT print the request line the comp shows', () => {
    // "GET /nowhere → 404" is a prototype affordance: it tells a stranger the
    // status code of the page they are looking at, in a typeface that reads as
    // an error log. Spec-correction #20.
    const { container } = render(<NotFoundPanel code="404" heading="h" body="b" />)
    expect(container.textContent).not.toMatch(/GET |→ 404/)
  })

  it('carries a takedown code without changing shape', () => {
    render(<NotFoundPanel code="404 · noindex" heading="Not available" body="b" />)
    expect(screen.getByText('404 · noindex')).toBeInTheDocument()
  })

  it('needs no JavaScript — every way out is a link', () => {
    render(<NotFoundPanel code="404" heading="h" body="b" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
