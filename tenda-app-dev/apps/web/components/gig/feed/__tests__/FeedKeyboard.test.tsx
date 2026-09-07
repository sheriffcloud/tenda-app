import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Link from 'next/link'
import { APP_INFO } from '@tenda/shared'
import { FeedKeyboard, GIG_CARD_ATTR } from '@/components/gig/feed/FeedKeyboard'
import { FeedHero } from '@/components/gig/feed/FeedHero'

/** Three walkable cards plus the search box the rail puts above them. */
function Feed() {
  return (
    <>
      <input aria-label="search" />
      <Link href="/gig/a" {...{ [GIG_CARD_ATTR]: 0 }}>
        first
      </Link>
      <Link href="/gig/b" {...{ [GIG_CARD_ATTR]: 1 }}>
        second
      </Link>
      <Link href="/gig/c" {...{ [GIG_CARD_ATTR]: 2 }}>
        third
      </Link>
      <FeedKeyboard />
    </>
  )
}

const press = (key: string, target: Element | Document = document) =>
  fireEvent.keyDown(target, { key })

describe('FeedKeyboard', () => {
  it('renders nothing — it is behaviour, not chrome', () => {
    const { container } = render(<FeedKeyboard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('j walks forward from nothing focused, landing on the first card', () => {
    render(<Feed />)
    press('j')
    expect(document.activeElement).toBe(screen.getByText('first'))
    press('j')
    expect(document.activeElement).toBe(screen.getByText('second'))
  })

  it('k walks back, and from nothing focused also lands on the first card', () => {
    render(<Feed />)
    press('k')
    expect(document.activeElement).toBe(screen.getByText('first'))
    press('j')
    press('k')
    expect(document.activeElement).toBe(screen.getByText('first'))
  })

  it('arrow keys do the same thing — the mouseless reader need not know vi', () => {
    render(<Feed />)
    press('ArrowDown')
    expect(document.activeElement).toBe(screen.getByText('first'))
    press('ArrowUp')
    expect(document.activeElement).toBe(screen.getByText('first'))
  })

  it('hands the key back to the browser when the walk cannot move', () => {
    // ArrowDown is how a great many readers scroll a page. The walk binds it,
    // so at the LAST card — where the walk has nowhere to go — swallowing it
    // would leave them unable to scroll down to the pager, the amount note or
    // the footer: the enhancement would have taken the page's scrolling away
    // and given nothing back. Same at the top with ArrowUp.
    // `fireEvent` returns false when a handler called preventDefault.
    render(<Feed />)
    screen.getByText('third').focus()
    expect(fireEvent.keyDown(document, { key: 'ArrowDown' })).toBe(true)

    screen.getByText('first').focus()
    expect(fireEvent.keyDown(document, { key: 'ArrowUp' })).toBe(true)
  })

  it('DOES consume the key when it moves, so the page does not scroll as well', () => {
    render(<Feed />)
    screen.getByText('first').focus()
    expect(fireEvent.keyDown(document, { key: 'ArrowDown' })).toBe(false)
    expect(document.activeElement).toBe(screen.getByText('second'))
  })

  it('consumes the first press from nowhere, in both directions', () => {
    // -1 → 0 is a real move, so it is the walk's key to take.
    const { unmount } = render(<Feed />)
    expect(fireEvent.keyDown(document, { key: 'ArrowDown' })).toBe(false)
    unmount()

    render(<Feed />)
    expect(fireEvent.keyDown(document, { key: 'ArrowUp' })).toBe(false)
  })

  it('clamps at both ends rather than wrapping', () => {
    render(<Feed />)
    for (let i = 0; i < 9; i += 1) press('j')
    expect(document.activeElement).toBe(screen.getByText('third'))
    for (let i = 0; i < 9; i += 1) press('k')
    expect(document.activeElement).toBe(screen.getByText('first'))
  })

  it('continues from wherever the reader ALREADY is, not from a hidden cursor', () => {
    render(<Feed />)
    screen.getByText('third').focus()
    press('k')
    expect(document.activeElement).toBe(screen.getByText('second'))
  })

  it('leaves the search box alone — typing "join" must not walk the feed', () => {
    render(<Feed />)
    const search = screen.getByLabelText('search')
    search.focus()
    press('j', search)
    expect(document.activeElement).toBe(search)
  })

  it('never steals a chord', () => {
    render(<Feed />)
    fireEvent.keyDown(document, { key: 'j', metaKey: true })
    fireEvent.keyDown(document, { key: 'j', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'j', altKey: true })
    expect(document.activeElement).toBe(document.body)
  })

  it('ignores keys that are not the walk', () => {
    render(<Feed />)
    press('x')
    expect(document.activeElement).toBe(document.body)
  })

  it('does nothing when there are no cards to walk', () => {
    render(<FeedKeyboard />)
    press('j')
    expect(document.activeElement).toBe(document.body)
  })

  it('stops listening once unmounted', () => {
    const { unmount } = render(<Feed />)
    unmount()
    press('j')
    expect(document.activeElement).toBe(document.body)
  })
})

describe('FeedHero', () => {
  it('leads with the shared brand line and supports it with the product one', () => {
    render(<FeedHero />)
    // The h1 is the TAGLINE (the brand-line role); the description moved to
    // the lede beneath it, where app-info.ts says the product summary belongs.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(APP_INFO.tagline)
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('writes no pitch string of its own — all three come from APP_INFO', () => {
    // The drift guard, locally. A hand-written headline here is exactly what
    // pitch-strings.test.ts exists to stop, and this fails first and faster.
    const { container } = render(<FeedHero />)
    const text = container.textContent ?? ''
    for (const owned of [APP_INFO.tagline, APP_INFO.description, APP_INFO.guarantee]) {
      expect(text).toContain(owned)
    }
  })
})
