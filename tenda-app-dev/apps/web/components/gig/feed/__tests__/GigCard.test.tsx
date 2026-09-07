import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AGENT_BADGE_LABEL, CATEGORY_LABELS, chainLabel, formatAssetAmount, splitAssetAmount } from '@tenda/shared'
import type { GigSummary } from '@tenda/shared'
import { GigCard } from '@/components/gig/feed/GigCard'
import { toGigCardModel } from '@/components/gig/feed/gig-card-model'
import { CATEGORY_TONE } from '@/components/gig/category-icons'
import { GIG_CARD_COPY } from '@/components/gig/feed/card-copy'
import { deliveryGig, photoGig } from '@/e2e/fixtures/gigs'

/** Hours from now as an ISO string, for the accept-window branches. */
const inHours = (hours: number) =>
  new Date(Date.now() + hours * 3_600_000).toISOString()

describe('GigCard', () => {
  it('badges an agent poster with the shared label, and a person with nothing', () => {
    const byAgent: GigSummary = { ...deliveryGig, creator: { ...deliveryGig.creator, is_agent: true } }
    const { unmount } = render(<GigCard gig={byAgent} />)
    expect(screen.getByText(AGENT_BADGE_LABEL)).toBeInTheDocument()
    unmount()
    render(<GigCard gig={deliveryGig} />)
    expect(screen.queryByText(AGENT_BADGE_LABEL)).not.toBeInTheDocument()
  })

  it('links to the gig by its escrow id', () => {
    render(<GigCard gig={deliveryGig} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', `/gig/${deliveryGig.escrow_id}`)
  })

  it('shows the amount and its ticker as separate elements, from ONE formatter', () => {
    render(<GigCard gig={deliveryGig} />)
    const { amount, symbol } = splitAssetAmount(deliveryGig.amount_raw, deliveryGig.asset)
    expect(screen.getByText(amount)).toBeInTheDocument()
    expect(screen.getByText(symbol)).toBeInTheDocument()
    // 25 USDC at 6dp — a card quietly rendering base units is the failure
    // this pins, and it would look plausible.
    expect(amount).toBe('25')
  })

  it('the two halves read as one amount in plain TEXT, not only to a reader', () => {
    // A copy-paste, a text scraper and a simple crawler all see textContent,
    // and adjacent spans with only a flex gap between them yield "25USDC".
    render(<GigCard gig={deliveryGig} />)
    expect(screen.getByRole('link').textContent).toContain(
      formatAssetAmount(deliveryGig.amount_raw, deliveryGig.asset),
    )
  })

  it('names the category from the shared vocabulary and tints it with its tone', () => {
    render(<GigCard gig={deliveryGig} />)
    const label = screen.getByText(CATEGORY_LABELS.delivery)
    expect(label.className).toContain(CATEGORY_TONE.delivery.text)
  })

  it('says Accept on a direct gig and Apply on an approval gig — before you take it', () => {
    const { unmount } = render(<GigCard gig={deliveryGig} />)
    expect(screen.getByText(GIG_CARD_COPY.accept)).toBeInTheDocument()
    expect(screen.queryByText(GIG_CARD_COPY.apply)).not.toBeInTheDocument()
    unmount()

    render(<GigCard gig={photoGig} />)
    expect(screen.getByText(GIG_CARD_COPY.apply)).toBeInTheDocument()
  })

  it('resolves the country CODE to a name, and answers Remote for a remote gig', () => {
    const { unmount } = render(<GigCard gig={deliveryGig} />)
    expect(screen.getByText('Lagos, Nigeria')).toBeInTheDocument()
    expect(screen.queryByText(/\bNG\b/)).not.toBeInTheDocument()
    unmount()

    render(<GigCard gig={photoGig} />)
    expect(screen.getByText('Remote')).toBeInTheDocument()
  })

  it('warns when the accept window is nearly gone, instead of a constant "Open"', () => {
    const closing: GigSummary = { ...deliveryGig, accept_deadline: inHours(1) }
    render(<GigCard gig={closing} />)
    expect(screen.getByText(GIG_CARD_COPY.closingSoon)).toBeInTheDocument()
    expect(screen.queryByText(GIG_CARD_COPY.open)).not.toBeInTheDocument()
  })

  it('reads Open while there is room, including a gig with no deadline at all', () => {
    const { unmount } = render(<GigCard gig={{ ...deliveryGig, accept_deadline: inHours(72) }} />)
    expect(screen.getByText(GIG_CARD_COPY.open)).toBeInTheDocument()
    unmount()

    render(<GigCard gig={{ ...deliveryGig, accept_deadline: null }} />)
    expect(screen.getByText(GIG_CARD_COPY.open)).toBeInTheDocument()
  })

  it('renders the poster rating with a sayable label, not a bare glyph', () => {
    render(<GigCard gig={deliveryGig} />)
    // The fixture stores '4.80'; the card must not print the second decimal.
    expect(screen.getByLabelText(GIG_CARD_COPY.ratingLabel('4.8'))).toHaveTextContent('★ 4.8')
  })

  it('omits the rating entirely for a poster nobody has reviewed', () => {
    const unrated: GigSummary = {
      ...deliveryGig,
      creator: { ...deliveryGig.creator, review_score: null },
    }
    render(<GigCard gig={unrated} />)
    expect(screen.queryByText(/★/)).not.toBeInTheDocument()
  })

  it('keeps the posted time TICKING, so a fresh gig stops saying "now"', () => {
    // The card renders once and then only when a realtime update lands, so a
    // timestamp sampled at render froze: a gig posted while the reader watched
    // read "now" for as long as they stayed on the feed.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-16T10:00:00.000Z'))
      render(<GigCard gig={{ ...deliveryGig, created_at: '2026-08-16T10:00:00.000Z' }} />)
      expect(screen.getByText('now')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(61_000)
      })
      expect(screen.getByText('1m')).toBeInTheDocument()
      expect(screen.queryByText('now')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('names the chain it settles on, through the shared label', () => {
    // The feed FILTERS by chain (`?chain_id=`), so an unfiltered reader was
    // comparing cards that settle on different networks with nothing on them
    // saying so — and which chain a gig pays on decides whether they hold a
    // wallet that can take it.
    render(<GigCard gig={deliveryGig} />)
    expect(screen.getByText(chainLabel(deliveryGig.chain_id))).toBeInTheDocument()
    // The label, never the raw CAIP-2 id.
    expect(screen.getByRole('link').textContent).not.toContain(deliveryGig.chain_id)
  })

  it('takes the chain from the GIG, not from a default', () => {
    // Two fixtures on two different chains: a hardcoded label would pass the
    // test above and fail this one.
    render(<GigCard gig={photoGig} />)
    expect(screen.getByText(chainLabel(photoGig.chain_id))).toBeInTheDocument()
    expect(chainLabel(photoGig.chain_id)).not.toBe(chainLabel(deliveryGig.chain_id))
  })

  it('carries the chain through the card MODEL the feed actually renders', () => {
    // The public feed projects GigSummary down to GigCardModel to keep base
    // units out of the RSC payload. A field the projection drops is invisible
    // on the real page however well the component handles it.
    render(<GigCard gig={toGigCardModel(deliveryGig)} />)
    expect(screen.getByText(chainLabel(deliveryGig.chain_id))).toBeInTheDocument()
  })

  it('gives the chain pair its OWN grid area, and lets the pair wrap, so no label is squeezed', () => {
    // Before #60 the category, the chain and the window shared one flex row
    // and the category read "DELIVE…" at 1280px too (a card is ~280px at every
    // viewport). Now the category and the pair are separate NAMED AREAS, and
    // the pair wraps so the window badge drops under the chain pill on the
    // 272px card a 320px phone gets. jsdom cannot lay out, so this asserts the
    // rule; the e2e measures the overflow at 320/360/390 and 768-1280.
    render(<GigCard gig={deliveryGig} />)
    const eyebrow = screen.getByText(CATEGORY_LABELS[deliveryGig.category])
    expect(eyebrow.parentElement?.className).toContain('[grid-area:meta]')
    const pair = screen.getByText(GIG_CARD_COPY.open).parentElement
    expect(pair?.className).toContain('[grid-area:chain]')
    expect(pair?.className).toContain('flex-wrap')
    expect(pair?.querySelector(`[data-chain-badge="${deliveryGig.chain_id}"]`)).not.toBeNull()
    // And no truncation dressing on a label that is one short word: every
    // CATEGORY_LABELS entry fits, so a `truncate` here would be inert.
    expect(eyebrow.className).not.toContain('truncate')
  })

  it('draws a ROW density for the list view: one-line title, the verb on the time line', () => {
    // The #60 preview's list row keeps the title to one line (a row truncates,
    // a card breaks — CLAUDE.md, "text a poster wrote") and moves the take
    // verb from the footer to the place/time line; the grid card does the
    // opposite. Both densities carry every fact — only the placement moves.
    render(<GigCard gig={deliveryGig} density="row" />)
    const card = screen.getByRole('link')
    expect(card).toHaveAttribute('data-gig-density', 'row')
    expect(card.className).not.toContain('rounded-card')
    expect(card.className).toContain('border-b')
    const title = screen.getByRole('heading', { level: 3 })
    expect(title.className).toContain('truncate')
    expect(title.className).not.toContain('break-words')
    const verb = screen.getByText(GIG_CARD_COPY.accept)
    expect(verb.parentElement?.className).toContain('[grid-area:time]')
    expect(screen.getByText('Lagos, Nigeria')).toBeInTheDocument()
    expect(screen.getByText(chainLabel(deliveryGig.chain_id))).toBeInTheDocument()
  })

  it('defaults to the GRID density: a card with the verb in its footer', () => {
    render(<GigCard gig={deliveryGig} />)
    const card = screen.getByRole('link')
    expect(card).toHaveAttribute('data-gig-density', 'grid')
    expect(card.className).toContain('rounded-card')
    expect(screen.getByText(GIG_CARD_COPY.accept).parentElement?.className).toContain('[grid-area:foot]')
  })

  it('can shrink below its content, and lets a poster-written title break', () => {
    // Both halves are needed and jsdom cannot lay out, so this asserts the
    // pair rather than the pixels — the e2e measures the actual overflow.
    // `overflow-wrap: break-word` does NOT reduce an element's min-content
    // width, so on its own it changed nothing: the card, a flex/grid item with
    // the default `min-width:auto`, still sized to the longest unbreakable
    // token and dragged the grid track out with it (+474px at 360px).
    render(<GigCard gig={deliveryGig} />)
    const card = screen.getByRole('link')
    expect(card.className).toContain('min-w-0')
    expect(screen.getByRole('heading', { level: 3 }).className).toContain('break-words')
  })

  it('lets the place line shrink so its truncation can actually happen', () => {
    // `truncate` is inert on a flex item that is not allowed to shrink, and
    // `city` is free text a poster typed.
    render(<GigCard gig={deliveryGig} />)
    const place = screen.getByText('Lagos, Nigeria')
    expect(place.className).toContain('truncate')
    expect(place.className).toContain('min-w-0')
  })

  it('marks itself walkable so the keyboard layer can find it', () => {
    render(<GigCard gig={deliveryGig} index={2} />)
    expect(screen.getByRole('link')).toHaveAttribute('data-gig-card', '2')
  })
})
