'use client'

/**
 * The j/k walk the rail promises, as pure enhancement: it renders nothing and
 * moves DOM FOCUS between the cards rather than mirroring them in React state.
 *
 * Focus, not a state cursor, for three reasons that all matter here:
 *   - the cards are server-rendered, and a stateful cursor would force the
 *     whole grid into a client component, serialising every gig into the HTML
 *     a second time on a page whose weight is its point;
 *   - the browser draws :focus-visible itself, so the cursor is styled by the
 *     platform and is correct for keyboard users without a second convention;
 *   - Enter needs no handler at all — the focused element is the card's own
 *     <a>, so opening it is native, works with modifier-click, and shows the
 *     target URL in the status bar like any other link.
 *
 * With JavaScript off the feed loses this and nothing else; Tab still walks
 * the same cards in the same order.
 */
import { useEffect } from 'react'
import { NEXT_KEYS, PREVIOUS_KEYS, isTypingTarget } from '@/lib/keyboard'

/** Marks a card as walkable. One string, so the grid and this agree. */
export const GIG_CARD_ATTR = 'data-gig-card'

export function FeedKeyboard() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Never steal a chord — ⌘K and browser shortcuts belong to others.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      const forward = NEXT_KEYS.has(event.key)
      if (!forward && !PREVIOUS_KEYS.has(event.key)) return

      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(`[${GIG_CARD_ATTR}]`),
      )
      if (cards.length === 0) return

      // Where the reader is NOW, which may be a card they reached by Tab or
      // by clicking — the walk continues from there rather than from a cursor
      // this component remembers and the reader cannot see. findIndex, not
      // indexOf: `activeElement` is `Element | null` and comparing directly
      // answers -1 for "not on a card" without a narrowing branch that no
      // test could reach.
      const current = cards.findIndex((card) => card === document.activeElement)

      // From "nowhere", both directions land on the first card: j because it
      // is next, k because there is nothing above to step back to.
      const next = forward
        ? Math.min(current + 1, cards.length - 1)
        : Math.max(current - 1, 0)

      // The key is only ours when the walk actually moves. ArrowDown/ArrowUp
      // are how a great many readers scroll, and the clamps mean the ends of
      // the list produce no movement — so consuming the key there would leave
      // someone stuck at the last card, unable to scroll on to the pager or
      // the footer. The enhancement would have taken the page's scrolling away
      // and given nothing back. j/k fall through harmlessly for the same
      // reason: they scroll nothing, so nothing is lost by not claiming them.
      if (next === current) return

      event.preventDefault()
      cards[next].focus()
      // `nearest` only scrolls when the card is actually out of view, so a
      // visible card does not jolt the page.
      cards[next].scrollIntoView({ block: 'nearest' })
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return null
}
