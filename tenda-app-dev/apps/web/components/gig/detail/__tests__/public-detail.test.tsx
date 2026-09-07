/**
 * The anonymous half of /gig/[id]. The load-bearing property across all of
 * these: the page reads listing fields ONLY, so a hostile server that serves
 * party-scoped values anyway cannot get them onto a crawler-visible page.
 */
import { act, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CATEGORY_LABELS, PROOF_TYPE_LABEL, chainLabel, type GigDetail } from '@tenda/shared'
import { GigBrief, briefParagraphs } from '@/components/gig/detail/GigBrief'
import { GigDetailHeader } from '@/components/gig/detail/GigDetailHeader'
import { GigDetailSection } from '@/components/gig/detail/GigDetailSection'
import { GigListingArticle } from '@/components/gig/detail/GigListingArticle'
import { GigPosterCard } from '@/components/gig/detail/GigPosterCard'
import { GigProofList } from '@/components/gig/detail/GigProofList'
import { GigSettlementSteps } from '@/components/gig/detail/GigSettlementSteps'
import { GigTerms, gigTerms } from '@/components/gig/detail/GigTerms'
import { GigUnavailable } from '@/components/gig/detail/GigUnavailable'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'
import {
  LEAKED_COUNTERPARTY_NAME,
  deliveryGigDetail,
} from '@/e2e/fixtures/gigs'

const gig = deliveryGigDetail
const labelOf = (term: string) => gigTerms(gig).find((t) => t.label === term)

describe('GigDetailHeader', () => {
  it('breadcrumbs back to the feed and to the category slice of it', () => {
    render(<GigDetailHeader gig={gig} />)
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(crumbs.getByRole('link', { name: GIG_DETAIL_COPY.breadcrumbRoot })).toHaveAttribute(
      'href',
      '/',
    )
    expect(
      crumbs.getByRole('link', { name: CATEGORY_LABELS[gig.category] }),
    ).toHaveAttribute('href', `/?category=${gig.category}`)
  })

  it('shows the escrow id in full — it is what a reader quotes to support', () => {
    render(<GigDetailHeader gig={gig} />)
    expect(screen.getByText(gig.escrow_id)).toBeInTheDocument()
  })

  it('is the page headline', () => {
    render(<GigDetailHeader gig={gig} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(gig.title)
  })

  it('resolves the location, and flags cross-border only when the gig is', () => {
    const { unmount } = render(<GigDetailHeader gig={gig} />)
    expect(screen.getByText('Lagos, Nigeria')).toBeInTheDocument()
    expect(screen.queryByText(GIG_DETAIL_COPY.crossBorder)).not.toBeInTheDocument()
    unmount()

    render(<GigDetailHeader gig={{ ...gig, cross_border: true }} />)
    expect(screen.getByText(GIG_DETAIL_COPY.crossBorder)).toBeInTheDocument()
  })

  it('lets the poster-written title and the place break rather than overflow', () => {
    const { container } = render(<GigDetailHeader gig={gig} />)
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('break-words')
    // The place is a BREAK, not a truncate: on the detail page the location is
    // a fact the reader is deciding on, and half of it is worse than two lines.
    const place = screen.getByText('Lagos, Nigeria')
    expect(place.className).toContain('break-words')
    expect(place.className).not.toContain('truncate')
    // The chip is a flex row, so the text child must be allowed to shrink
    // before it is allowed to break.
    expect(container.querySelector('.min-w-0')).not.toBeNull()
  })

  it('keeps "Posted" TICKING — it is a claim about the present tense', () => {
    // This block used to be a server-rendered string, frozen in the HTML: a
    // gig posted a moment ago read "Posted now" for the whole visit.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-16T10:00:00.000Z'))
      render(<GigDetailHeader gig={{ ...gig, created_at: '2026-08-16T10:00:00.000Z' }} />)
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
})

describe('briefParagraphs', () => {
  it('splits on blank lines, which is how posters write paragraphs', () => {
    expect(briefParagraphs('One.\n\nTwo.')).toEqual(['One.', 'Two.'])
  })

  it('keeps single line breaks inside a paragraph', () => {
    expect(briefParagraphs('Line one\nline two')).toEqual(['Line one\nline two'])
  })

  it('drops blank and whitespace-only blocks rather than rendering empty <p>s', () => {
    expect(briefParagraphs('One.\n\n   \n\nTwo.')).toEqual(['One.', 'Two.'])
    expect(briefParagraphs('   ')).toEqual([])
    expect(briefParagraphs('')).toEqual([])
  })

  it('treats an absent description as no paragraphs, never as a crash', () => {
    expect(briefParagraphs(null)).toEqual([])
  })
})

describe('GigBrief', () => {
  it('renders one paragraph per block', () => {
    // Braces, not a JSX string attribute: "\n" inside quotes is a literal
    // backslash-n, and the assertion would pass without splitting anything.
    const { container } = render(<GigBrief description={'One.\n\nTwo.'} />)
    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(screen.getByText('One.')).toBeInTheDocument()
    expect(screen.getByText('Two.')).toBeInTheDocument()
  })

  it('says so when there is no brief, rather than leaving empty space', () => {
    render(<GigBrief description={null} />)
    expect(screen.getByText(GIG_DETAIL_COPY.briefEmpty)).toBeInTheDocument()
  })

  it('treats an empty-string description as absent', () => {
    render(<GigBrief description="" />)
    expect(screen.getByText(GIG_DETAIL_COPY.briefEmpty)).toBeInTheDocument()
  })
})

describe('gigTerms', () => {
  it('leads with the payment, in display units', () => {
    expect(gigTerms(gig)[0]).toMatchObject({ label: 'Payment', value: '25 USDC' })
  })

  it('names the chain through the shared label, never the raw CAIP-2 id', () => {
    // The value is a node since #60 (the badge), so it is read as rendered.
    const { container } = render(<>{labelOf('Chain')?.value}</>)
    // The badge's aria-hidden glyph is in textContent too; the LABEL is
    // what must be there, and the id what must not.
    expect(container.textContent).toContain(chainLabel(gig.chain_id))
    expect(container.textContent).not.toContain(gig.chain_id)
  })

  it('draws the chain as the shared BADGE in the terms AND in the header facts (#60)', () => {
    const { container, unmount } = render(<GigTerms gig={gig} />)
    expect(container.querySelector(`dd [data-chain-badge="${gig.chain_id}"]`)).not.toBeNull()
    unmount()
    const header = render(<GigDetailHeader gig={gig} />).container
    expect(header.querySelector(`[data-chain-badge="${gig.chain_id}"]`)).not.toBeNull()
    // Still the label, never the raw id, anywhere on either.
    expect(header.textContent).not.toContain(gig.chain_id)
  })

  it('omits terms the wire does not carry rather than printing a dash', () => {
    const sparse: GigDetail = {
      ...gig,
      completion_duration_seconds: null,
      accept_deadline: null,
    }
    const labels = gigTerms(sparse).map((t) => t.label)
    // `created_at` is NOT in the sparse set: escrows.created_at is NOT NULL, so
    // Posted is the one term that survives however little else the wire carries.
    expect(labels).toEqual(['Payment', 'Chain', 'Location', 'Posted'])
  })

  it('states the deadline in a FIXED zone, and NAMES it', () => {
    // This renders on the server, so an unpinned zone makes the deadline a
    // property of the container's TZ rather than of the gig. And an
    // unlabelled wall-clock time is worse than a labelled one a reader has to
    // convert: on a deadline, "14:00" with no zone is a guess.
    const value = labelOf('Accepting until')?.value
    expect(value).toContain('UTC')
    // The instant itself, not just the suffix. The fixture deadline is
    // 2030-01-01T12:00:00Z, so a formatter that fell back to the machine's TZ
    // prints a different wall clock anywhere but UTC — which is what a
    // container in Lagos or a developer's laptop would do.
    expect(value).toContain('12:00')
    expect(value).toContain('1 Jan')
  })

  it('reads NO party-scoped field — a hostile server cannot leak through it', () => {
    // Asserted against the RENDERED terms, not against `${term.value}`. A term
    // whose value is a node — "Posted" is one — stringifies to
    // "[object Object]" in a template, so the interpolating form passed
    // vacuously for exactly the term it was meant to search.
    const { container } = render(<GigTerms gig={gig} />)
    expect(container.textContent).not.toContain(LEAKED_COUNTERPARTY_NAME)
    // The control that the search really does reach INSIDE a node-valued term.
    // Asserting the string "Posted" would not: that is the <dt> LABEL, a plain
    // string in a sibling element, and it would still be found if every <dd>
    // rendered nothing at all. The posted term puts its value in a <time>, so
    // that element's own text is what has to be part of what was searched.
    const postedValue = container.querySelector('time')?.textContent ?? ''
    expect(postedValue).not.toBe('')
    expect(container.textContent).toContain(postedValue)
  })
})

describe('GigTerms', () => {
  it('renders each term as a definition pair', () => {
    const { container } = render(<GigTerms gig={gig} />)
    expect(container.querySelectorAll('dt')).toHaveLength(gigTerms(gig).length)
    expect(screen.getByText('25 USDC')).toBeInTheDocument()
  })

  it('lets EVERY value break — Location carries free text a poster typed', () => {
    // A 57-character place name painted 176px outside this column and scrolled
    // the whole document sideways. The rule is per-<dd>, not per-term, so a
    // future term cannot opt out of it by accident.
    const { container } = render(<GigTerms gig={gig} />)
    const values = Array.from(container.querySelectorAll('dd'))
    expect(values.length).toBeGreaterThan(0)
    for (const dd of values) expect(dd.className).toContain('break-words')
  })
})

describe('GigProofList', () => {
  it('names each required proof type from the shared vocabulary', () => {
    render(<GigProofList requirements={['image', 'document']} />)
    expect(screen.getByText(PROOF_TYPE_LABEL.image)).toBeInTheDocument()
    expect(screen.getByText(PROOF_TYPE_LABEL.document)).toBeInTheDocument()
    expect(screen.queryByText(PROOF_TYPE_LABEL.video)).not.toBeInTheDocument()
  })

  it('says "any evidence" when nothing is required — the pre-field behaviour', () => {
    render(<GigProofList requirements={[]} />)
    expect(screen.getByText(GIG_DETAIL_COPY.proofAnyTitle)).toBeInTheDocument()
  })

  it('keeps every item inside the list, empty case included', () => {
    const { container } = render(<GigProofList requirements={[]} />)
    expect(container.querySelectorAll('ul > li')).toHaveLength(1)
  })

  it('shows the bar a param-bearing requirement sets — the worker sees it BEFORE accepting', () => {
    render(
      <GigProofList
        requirements={['geotag', 'structured', 'image']}
        params={{
          geotag: { radius_m: 1500 },
          structured: {
            fields: [
              { name: 'count', kind: 'number', required: true },
              { name: 'note', kind: 'string', required: false },
            ],
          },
        }}
      />,
    )
    expect(screen.getByText("Check in within 1,500 m of the gig's location")).toBeInTheDocument()
    expect(screen.getByText('Report: count, note (optional)')).toBeInTheDocument()
  })

  it('a gig that declared no params (every pre-#14 row) gets no detail line', () => {
    render(<GigProofList requirements={['geotag']} params={null} />)
    expect(screen.queryByText(/Check in within/)).not.toBeInTheDocument()
  })
})

describe('GigPosterCard', () => {
  it('shows the poster and their average, at one decimal', () => {
    render(<GigPosterCard creator={gig.creator} />)
    expect(screen.getByText('Ada Okafor')).toBeInTheDocument()
    expect(screen.getByText('4.8')).toBeInTheDocument()
  })

  it('says "no reviews yet" rather than printing a zero nobody earned', () => {
    render(<GigPosterCard creator={{ ...gig.creator, review_score: null }} />)
    expect(screen.getByText(GIG_DETAIL_COPY.noRating)).toBeInTheDocument()
  })

  it('shows a genuine zero average — hiding it would flatter the worst posters', () => {
    render(<GigPosterCard creator={{ ...gig.creator, review_score: '0.00' }} />)
    expect(screen.getByText('0.0')).toBeInTheDocument()
    expect(screen.queryByText(GIG_DETAIL_COPY.noRating)).not.toBeInTheDocument()
  })

  it('points at where the rest of the profile lives instead of teasing a lock', () => {
    render(<GigPosterCard creator={gig.creator} />)
    expect(screen.getByText(GIG_DETAIL_COPY.postedByNote)).toBeInTheDocument()
  })
})

describe('GigSettlementSteps', () => {
  it('step one follows the ACCEPTANCE MODE — apply vs accept', () => {
    const { unmount } = render(<GigSettlementSteps requiresApproval />)
    expect(screen.getByText(GIG_DETAIL_COPY.settleSteps.apply)).toBeInTheDocument()
    expect(screen.queryByText(GIG_DETAIL_COPY.settleSteps.accept)).not.toBeInTheDocument()
    unmount()

    render(<GigSettlementSteps requiresApproval={false} />)
    expect(screen.getByText(GIG_DETAIL_COPY.settleSteps.accept)).toBeInTheDocument()
  })

  it('is an ordered list of four steps, ending at the payout', () => {
    render(<GigSettlementSteps requiresApproval={false} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[3]).toHaveTextContent(/releases the net amount/)
  })

  it('links to the escrow explainer', () => {
    render(<GigSettlementSteps requiresApproval={false} />)
    expect(
      screen.getByRole('link', { name: new RegExp(GIG_DETAIL_COPY.settleLink) }),
    ).toHaveAttribute('href', '/support/escrow')
  })
})

describe('GigDetailSection', () => {
  it('publishes its title into the document outline', () => {
    render(
      <GigDetailSection title="Terms">
        <p>body</p>
      </GigDetailSection>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Terms' })).toBeInTheDocument()
  })
})

describe('GigUnavailable', () => {
  it('says the read failed WITHOUT implying the gig or the escrow is gone', () => {
    // A read failure is not a missing gig (that is notFound) and not a lost
    // agreement. Rendered by the page, not an error boundary, because the
    // boundary is a client component and a reader with no JavaScript saw a
    // blank page.
    render(<GigUnavailable href="/gig/gig-1" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(GIG_DETAIL_COPY.unavailableBody)).toBeInTheDocument()
    expect(screen.getByText(/read failure only/)).toBeInTheDocument()
  })

  it('offers a retry of THIS gig and a way out to the feed', () => {
    // Either may be the one that works: the feed is a different read.
    render(<GigUnavailable href="/gig/gig-1" />)
    expect(
      screen.getByRole('link', { name: new RegExp(GIG_DETAIL_COPY.unavailableAction) }),
    ).toHaveAttribute('href', '/gig/gig-1')
    expect(
      screen.getByRole('link', { name: GIG_DETAIL_COPY.unavailableBrowse }),
    ).toHaveAttribute('href', '/')
  })

  it('needs no JavaScript — both ways forward are plain links', () => {
    render(<GigUnavailable href="/gig/gig-1" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

it('GigListingArticle — the ONE composition (#48) keeps the agreement BEFORE the person', () => {
  // /gig/[id] and /home each hand-composed this article until #48; the order
  // is encoded once and pinned here. FOLLOWING = the arg AFTER the receiver.
  render(<GigListingArticle gig={gig} />)
  const heading = (name: string) => screen.getByRole('heading', { name })
  expect(heading(GIG_DETAIL_COPY.brief)).toBeInTheDocument()
  expect(heading(GIG_DETAIL_COPY.proof)).toBeInTheDocument()
  expect(
    heading(GIG_DETAIL_COPY.terms).compareDocumentPosition(heading(GIG_DETAIL_COPY.postedBy)) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})
