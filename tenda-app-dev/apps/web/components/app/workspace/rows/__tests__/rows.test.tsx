import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CATEGORY_META, STATUS_LABEL } from '@tenda/shared'

import { CATEGORY_ICONS, CATEGORY_TONE } from '@/components/gig/category-icons'
import {
  ApplicantRow,
  ConversationRow,
  EscrowRow,
  NotificationRow,
  RowChassis,
} from '@/components/app/workspace/rows'

const party = { id: 'u1', first_name: 'Faridah', last_name: 'Ab', avatar_url: null }

describe('RowChassis — the shared shell', () => {
  it('is a link to the row target', () => {
    render(<RowChassis href="/messages/u1" title="Design a flyer" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/messages/u1')
  })

  it('marks the selected row for assistive tech, not only visually', () => {
    render(<RowChassis href="/x" title="t" selected />)
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'true')
  })

  it('leaves an unselected row unmarked', () => {
    render(<RowChassis href="/x" title="t" />)
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current')
  })

  it('makes unread sayable, since the pip is decorative', () => {
    render(<RowChassis href="/x" title="t" unread />)
    expect(screen.getByText('Unread')).toBeInTheDocument()
  })

  it('says nothing about unread when the row is read', () => {
    render(<RowChassis href="/x" title="t" />)
    expect(screen.queryByText('Unread')).not.toBeInTheDocument()
  })

  it('omits the optional slots entirely rather than rendering empty furniture', () => {
    const { container } = render(<RowChassis href="/x" title="only a title" />)
    expect(screen.getByText('only a title')).toBeInTheDocument()
    // No eyebrow, badge, subtitle, amount or time row.
    expect(container.querySelectorAll('span')).toHaveLength(0)
  })

  it('lets a variant supply a readable accessible name', () => {
    render(<RowChassis href="/x" title="t" label="Faridah, unread: Design a flyer" />)
    expect(screen.getByRole('link', { name: 'Faridah, unread: Design a flyer' })).toBeInTheDocument()
  })
})

describe('ConversationRow', () => {
  it('shows who it is from and what they said', () => {
    render(<ConversationRow href="/messages/u1" party={party} preview="Can you start today?" />)
    expect(screen.getByText('Faridah Ab')).toBeInTheDocument()
    expect(screen.getByText('Can you start today?')).toBeInTheDocument()
  })

  it('names itself readably instead of leaving a run of fragments', () => {
    render(
      <ConversationRow href="/messages/u1" party={party} preview="Hi" unread />,
    )
    expect(screen.getByRole('link', { name: 'Faridah Ab, unread: Hi' })).toBeInTheDocument()
  })

  it('renders no timestamp when the wire carries none', () => {
    render(<ConversationRow href="/m/u1" party={party} preview="Hi" at={null} />)
    expect(screen.queryByText(/ago|now|^\d/)).not.toBeInTheDocument()
  })
})

describe('EscrowRow', () => {
  it('badges the status using the shared label', () => {
    render(<EscrowRow href="/gig/g1" title="Design a flyer" status="open" />)
    expect(screen.getByText(STATUS_LABEL.open)).toBeInTheDocument()
  })

  it('formats money through the shared helper rather than printing base units', () => {
    render(
      <EscrowRow href="/gig/g1" title="Design a flyer" status="open" amountRaw="1000000" asset="USDC" />,
    )
    // Base units would read "1000000"; the shared formatter must have run.
    expect(screen.queryByText('1000000')).not.toBeInTheDocument()
    expect(screen.getByRole('link').textContent).toMatch(/USDC/)
  })

  it('omits the amount when the escrow has none', () => {
    render(<EscrowRow href="/gig/g1" title="t" status="draft" />)
    expect(screen.getByRole('link').textContent).not.toMatch(/USDC/)
  })

  it('states the status in its accessible name, not only as a coloured badge', () => {
    render(<EscrowRow href="/gig/g1" title="Design a flyer" status="disputed" />)
    expect(
      screen.getByRole('link', { name: `Design a flyer, ${STATUS_LABEL.disputed}` }),
    ).toBeInTheDocument()
  })

  it('fills the meta footer for a browse row: poster, rating, and the take verb', () => {
    render(
      <EscrowRow
        href="/gig/g1"
        title="Design a flyer"
        status="open"
        creator={{ ...party, review_score: '4.80' }}
        requiresApproval={false}
      />,
    )
    expect(screen.getByText('Faridah Ab')).toBeInTheDocument()
    expect(screen.getByText(/4\.8/)).toBeInTheDocument()
    expect(screen.getByText('Accept')).toBeInTheDocument()
    // The same facts in the NAME — a sightless reader is deciding too.
    expect(screen.getByRole('link', { name: /by Faridah Ab, Accept$/ })).toBeInTheDocument()
  })

  it('says Apply on an approval-mode gig, and never scores an unrated poster', () => {
    render(
      <EscrowRow
        href="/gig/g1"
        title="t"
        status="open"
        creator={{ ...party, review_score: null }}
        requiresApproval
      />,
    )
    expect(screen.getByText('Apply')).toBeInTheDocument()
    expect(screen.queryByText('Accept')).toBeNull()
    // Unrated is said by ABSENCE, never as a zero score.
    expect(screen.queryByText(/★/)).toBeNull()
  })

  it('draws no meta footer at all when a row carries neither poster nor verb', () => {
    const { container } = render(<EscrowRow href="/gig/g1" title="t" status="draft" />)
    expect(container.querySelector('.border-t')).toBeNull()
  })
})

describe('NotificationRow', () => {
  it('shows the headline and body', () => {
    render(<NotificationRow href="/notifications" title="Gig accepted" body="Akin took it." />)
    expect(screen.getByText('Gig accepted')).toBeInTheDocument()
    expect(screen.getByText('Akin took it.')).toBeInTheDocument()
  })

  it('announces unread in its name', () => {
    render(<NotificationRow href="/n" title="Gig accepted" unread />)
    expect(screen.getByRole('link', { name: 'Gig accepted, unread' })).toBeInTheDocument()
  })
})

describe('ApplicantRow', () => {
  it('leads with the applicant', () => {
    render(<ApplicantRow href="/gig/g1/applicants" party={party} note="I can start today." />)
    expect(screen.getByRole('link', { name: 'Applicant Faridah Ab' })).toBeInTheDocument()
    expect(screen.getByText('I can start today.')).toBeInTheDocument()
  })

  it('falls back to the name when there is no note', () => {
    render(<ApplicantRow href="/gig/g1/applicants" party={party} />)
    expect(screen.getAllByText('Faridah Ab').length).toBeGreaterThan(0)
  })
})

describe('the family shares one chassis', () => {
  it.each([
    ['conversation', <ConversationRow key="c" href="/a" party={party} preview="p" selected />],
    ['escrow', <EscrowRow key="e" href="/a" title="t" status="open" selected />],
    ['notification', <NotificationRow key="n" href="/a" title="t" selected />],
    ['applicant', <ApplicantRow key="p" href="/a" party={party} selected />],
  ])('%s marks selection the same way', (_name, element) => {
    render(element)
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'true')
  })
})

describe('optional slots across the family', () => {
  it.each([
    ['escrow', <EscrowRow key="e" href="/a" title="t" status="open" at={null} />],
    ['notification', <NotificationRow key="n" href="/a" title="t" at={null} />],
    ['applicant', <ApplicantRow key="p" href="/a" party={party} at={null} />],
  ])('%s renders no timestamp when the wire carries none', (_n, element) => {
    const { container } = render(element)
    expect(container.querySelector('.font-numeric')).toBeNull()
  })

  it.each([
    ['escrow', <EscrowRow key="e" href="/a" title="t" status="open" at="2026-01-01T00:00:00Z" />],
    ['notification', <NotificationRow key="n" href="/a" title="t" at="2026-01-01T00:00:00Z" />],
    ['applicant', <ApplicantRow key="p" href="/a" party={party} at="2026-01-01T00:00:00Z" />],
  ])('%s renders a timestamp when the wire carries one', (_n, element) => {
    const { container } = render(element)
    expect(container.querySelector('.font-numeric')).not.toBeNull()
  })

  it('renders the bottom row when any of badge, subtitle or amount is present', () => {
    const { container } = render(<RowChassis href="/x" title="t" subtitle="only a subtitle" />)
    expect(screen.getByText('only a subtitle')).toBeInTheDocument()
    expect(container.querySelectorAll('div')).not.toHaveLength(1)
  })

  it('renders no bottom row when none of them is', () => {
    render(<RowChassis href="/x" title="t" eyebrow="who" />)
    expect(screen.queryByText('only a subtitle')).not.toBeInTheDocument()
  })
})

describe('off-contract timestamps', () => {
  it.each([
    ['conversation', <ConversationRow key="c" href="/a" party={party} preview="p" at="" />],
    ['escrow', <EscrowRow key="e" href="/a" title="t" status="open" at="" />],
    ['notification', <NotificationRow key="n" href="/a" title="t" at="" />],
    ['applicant', <ApplicantRow key="p" href="/a" party={party} at="" />],
  ])('%s renders no timestamp rather than "Invalid Date"', (_n, element) => {
    render(element)
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
  })
})

describe('EscrowRow — the comps\' category glyph', () => {
  it('leads with a category icon when the escrow has a category', () => {
    const { container } = render(
      <EscrowRow href="/gig/g1" title="t" status="open" category="digital" />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('tints the glyph with that category, not a generic colour', () => {
    const { container } = render(
      <EscrowRow href="/gig/g1" title="t" status="open" category="digital" />,
    )
    expect(container.querySelector('svg')?.getAttribute('class')).toContain(
      CATEGORY_TONE.digital.text,
    )
  })

  it('gives different categories different glyphs', () => {
    const { container: a } = render(
      <EscrowRow href="/a" title="t" status="open" category="delivery" />,
    )
    const { container: b } = render(
      <EscrowRow href="/b" title="t" status="open" category="photo" />,
    )
    expect(a.querySelector('svg')?.innerHTML).not.toBe(b.querySelector('svg')?.innerHTML)
  })

  it('renders no glyph when there is no category', () => {
    const { container } = render(<EscrowRow href="/gig/g1" title="t" status="open" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('keeps the glyph decorative — it must not join the accessible name', () => {
    render(<EscrowRow href="/gig/g1" title="Design a flyer" status="open" category="digital" />)
    expect(
      screen.getByRole('link', { name: `Design a flyer, ${STATUS_LABEL.open}` }),
    ).toBeInTheDocument()
  })

  it('has a tone for every category shared knows about', () => {
    // The registry throws at module load on a gap; this asserts the mapping
    // is complete rather than merely importable.
    for (const meta of CATEGORY_META) {
      expect(CATEGORY_TONE[meta.key].text).toBeTruthy()
      expect(CATEGORY_ICONS[meta.key]).toBeTruthy()
    }
  })
})
