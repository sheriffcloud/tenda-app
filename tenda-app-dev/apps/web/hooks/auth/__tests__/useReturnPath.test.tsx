/**
 * The hook's whole reason to exist is the SERVER/client split, so both halves
 * are exercised — the client one in jsdom, and the server one through a real
 * `renderToString`.
 *
 * The server half is easy to leave untested and expensive to get wrong: it is
 * what keeps these statically prerendered pages from emitting one href on the
 * server and another in the browser. Reaching it by exporting the snapshot
 * function would prove only that a function returns null; rendering on the
 * server proves React actually asks it.
 */
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { render, screen } from '@testing-library/react'
import { useReturnPath } from '@/hooks/auth/useReturnPath'
import { withReturnPath } from '@/lib/auth/return-path'

/** A minimal consumer: exactly what the back links do with the value. */
function BackLink() {
  const next = useReturnPath()
  return <a href={withReturnPath('/signin', next)}>back</a>
}

describe('useReturnPath', () => {
  it('reads the destination out of the URL in the browser', () => {
    window.history.replaceState({}, '', '/signin/verify?next=%2Fmy-gigs%2Fesc-1')
    render(<BackLink />)
    expect(screen.getByRole('link', { name: 'back' })).toHaveAttribute(
      'href',
      '/signin?next=%2Fmy-gigs%2Fesc-1',
    )
    window.history.replaceState({}, '', '/')
  })

  it('refuses a hostile destination in the browser too', () => {
    window.history.replaceState({}, '', '/signin/verify?next=%2F%2Fevil.example')
    render(<BackLink />)
    expect(screen.getByRole('link', { name: 'back' })).toHaveAttribute('href', '/signin')
    window.history.replaceState({}, '', '/')
  })

  it('renders the BARE href on the server, where there is no URL to read', () => {
    // The prerendered markup. If this ever emitted the destination, the server
    // would be guessing at a URL it cannot see, and hydration would have two
    // different hrefs to reconcile.
    window.history.replaceState({}, '', '/signin/verify?next=%2Fmy-gigs%2Fesc-1')

    expect(renderToString(<BackLink />)).toContain('href="/signin"')

    window.history.replaceState({}, '', '/')
  })
})
