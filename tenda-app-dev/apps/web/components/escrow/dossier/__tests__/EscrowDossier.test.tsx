import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatAssetAmount } from '@tenda/shared'

import { DOSSIER_COPY, EscrowDossier, MoneyBlock, PartyScopedSection } from '@/components/escrow/dossier'
import { DISPUTE_NOTICE_COPY, DisputeNotice } from '@/components/escrow/DisputeNotice'
import { escrowChatHref } from '@/lib/chat-href'
import { formatRelativeDayWithTime } from '@tenda/shared'

const PARTY = { id: 'u2', first_name: 'Akin', last_name: 'Beela', avatar_url: null }

const base = {
  title: 'Design a flyer',
  amountRaw: '120000000',
  asset: 'USDC',
  escrow: { status: 'open' as const },
}

const privateHalf = () => document.querySelector('[data-party-scoped]')

describe('MoneyBlock — one figure, one projection', () => {
  it('renders the amount through the shared formatter, never raw base units', () => {
    render(<MoneyBlock amountRaw="120000000" asset="USDC" />)
    expect(screen.queryByText('120000000')).not.toBeInTheDocument()
    const expected = formatAssetAmount('120000000', 'USDC')
    expect(document.body.textContent).toContain(expected.split(' ')[0])
  })

  it('survives an amount far past Number.MAX_SAFE_INTEGER without losing digits', () => {
    // Base units are 78-digit decimal strings; Number() would round this.
    const huge = '123456789012345678901234567890'
    render(<MoneyBlock amountRaw={huge} asset="USDC" />)
    expect(document.body.textContent).not.toContain('e+')
    expect(document.body.textContent).not.toContain('NaN')
  })

  it('relies on a real formatAssetAmount contract: "<value> <symbol>"', () => {
    // MoneyBlock splits on the last space to size the two differently. If the
    // shared formatter ever stops emitting a space, that split silently
    // corrupts the amount — so assert the contract against the real function.
    const formatted = formatAssetAmount('1234567000000', 'USDC')
    expect(formatted).toMatch(/^.+ \S+$/)
    expect(formatted.lastIndexOf(' ')).toBeGreaterThan(0)
  })

  it('keeps a thousands-separated value intact when splitting off the symbol', () => {
    render(<MoneyBlock amountRaw="1234567000000" asset="USDC" />)
    const expected = formatAssetAmount('1234567000000', 'USDC')
    const symbol = expected.slice(expected.lastIndexOf(' ') + 1)
    expect(screen.getByText(expected.slice(0, expected.lastIndexOf(' ')))).toBeInTheDocument()
    expect(screen.getByText(symbol)).toBeInTheDocument()
  })

  it('says the figure is chain-attested net, so nobody subtracts a fee twice', () => {
    render(<MoneyBlock amountRaw="1000000" asset="USDC" />)
    expect(screen.getByText(DOSSIER_COPY.amountNote)).toBeInTheDocument()
  })

  it('shows no second money figure — the dossier must not re-project a fee', () => {
    render(<MoneyBlock amountRaw="1000000" asset="USDC" />)
    // A projected net beside an attested one is two numbers for the same
    // money. Asserted on the rendered VALUE rather than a CSS class, so the
    // test tracks behaviour and not styling.
    const formatted = formatAssetAmount('1000000', 'USDC')
    const value = formatted.slice(0, formatted.lastIndexOf(' '))
    expect(screen.getAllByText(value)).toHaveLength(1)
  })

  it('renders facts when given them, and no empty grid when not', () => {
    const { unmount } = render(
      <MoneyBlock amountRaw="1" asset="USDC" facts={[{ label: 'Chain', value: 'Base' }]} />,
    )
    expect(screen.getByText('Chain')).toBeInTheDocument()
    unmount()
    render(<MoneyBlock amountRaw="1" asset="USDC" />)
    expect(document.querySelector('dl')).toBeNull()
  })
})

describe('PartyScopedSection — the half outsiders never receive', () => {
  it('renders nothing at all when the server withheld every party field', () => {
    render(<PartyScopedSection />)
    expect(privateHalf()).toBeNull()
  })

  it('renders nothing for explicit nulls, which is what the wire sends an outsider', () => {
    render(<PartyScopedSection counterparty={null} proofs={null} dispute={null} />)
    expect(privateHalf()).toBeNull()
  })

  it('never synthesises a placeholder counterparty', () => {
    // An "Unknown counterparty" row would tell an outsider that a
    // counterparty EXISTS — the very fact being withheld.
    render(<PartyScopedSection counterparty={null} />)
    expect(screen.queryByText(DOSSIER_COPY.counterparty)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/unknown|anonymous/i)
  })

  it('shows the counterparty to a party', () => {
    render(<PartyScopedSection counterparty={PARTY} />)
    expect(screen.getByText(DOSSIER_COPY.counterparty)).toBeInTheDocument()
    expect(screen.getByText('Akin Beela')).toBeInTheDocument()
  })

  it('the counterparty card carries the contextual message link (#51)', () => {
    // The dossier was the one surface drawing a counterparty you could not
    // act on — a name with no profile link and no way to message.
    render(
      <PartyScopedSection
        counterparty={PARTY}
        counterpartyLabel="Worker"
        viewerId="u1"
        chatContext={{ id: 'escrow-1', title: 'Design a flyer', kind: 'gig' }}
      />,
    )
    expect(screen.getByText('Worker')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Message / })).toHaveAttribute(
      'href',
      escrowChatHref('u2', { id: 'escrow-1', title: 'Design a flyer', kind: 'gig' }),
    )
  })

  it('renders the dispute notice with its door, and adds no second heading (#51)', () => {
    render(
      <PartyScopedSection
        dispute={<DisputeNotice reason="Package never arrived" escrowId="escrow-1" isParty />}
      />,
    )
    expect(screen.getByText(DISPUTE_NOTICE_COPY.title)).toBeInTheDocument()
    expect(screen.getByText('Package never arrived')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: DISPUTE_NOTICE_COPY.openThread })).toHaveAttribute(
      'href',
      '/dispute/escrow-1',
    )
    expect(screen.getAllByText(/Dispute/)).toHaveLength(1)
  })

  it('tells a party the gig is assigned even when the assignee is not named', () => {
    render(<PartyScopedSection isAssigned />)
    expect(screen.getByText(DOSSIER_COPY.assignedUnnamed)).toBeInTheDocument()
  })

  it('does not repeat the assigned note once the counterparty is named', () => {
    render(<PartyScopedSection counterparty={PARTY} isAssigned />)
    expect(screen.queryByText(DOSSIER_COPY.assignedUnnamed)).not.toBeInTheDocument()
  })

  it('distinguishes "no evidence yet" from "evidence withheld"', () => {
    const { unmount } = render(<PartyScopedSection proofs={[]} />)
    expect(screen.getByText(DOSSIER_COPY.noProofs)).toBeInTheDocument()
    unmount()
    render(<PartyScopedSection proofs={null} />)
    expect(screen.queryByText(DOSSIER_COPY.noProofs)).not.toBeInTheDocument()
  })

  it('lists evidence for a party', () => {
    render(<PartyScopedSection proofs={[{ id: 'p1', label: 'receipt.pdf' }]} />)
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument()
  })

  it('lets a party OPEN the evidence, not just be told it exists', () => {
    // Approving or disputing turns on what the proof shows. A list that only
    // names it is the half of the information that cannot settle anything.
    render(
      <PartyScopedSection
        proofs={[{ id: 'p1', label: 'receipt.pdf', href: 'https://media/receipt.pdf' }]}
      />,
    )
    const link = screen.getByRole('link', { name: 'receipt.pdf' })
    expect(link).toHaveAttribute('href', 'https://media/receipt.pdf')
    // A new tab: losing the escrow you are mid-decision on is worse.
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('still renders a proof the wire gave no URL for', () => {
    render(<PartyScopedSection proofs={[{ id: 'p1', label: 'receipt.pdf', href: null }]} />)
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders a data proof as its payload lines — the substance, since there is no file', () => {
    render(
      <PartyScopedSection
        proofs={[
          {
            id: 'p2',
            label: 'Structured data',
            href: null,
            payloadLines: [
              { label: 'count', value: '3' },
              { label: null, value: 'Left at the gate' },
            ],
          },
        ]}
      />,
    )
    expect(screen.getByText('count:')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Left at the gate')).toBeInTheDocument()
  })

  it('formats the upload stamp rather than printing the ISO at a reader', () => {
    render(
      <PartyScopedSection
        proofs={[{ id: 'p1', label: 'receipt.pdf', uploadedAt: '2026-01-01T00:00:00Z' }]}
      />,
    )
    expect(screen.queryByText('2026-01-01T00:00:00Z')).toBeNull()
    expect(
      screen.getByText(formatRelativeDayWithTime('2026-01-01T00:00:00Z')),
    ).toBeInTheDocument()
  })

  it('stamps a proof the same way the timeline stamps its steps', () => {
    // One escrow, one way of saying when something happened.
    render(
      <EscrowDossier
        {...base}
        escrow={{ status: 'submitted', submitted_at: '2026-01-01T00:00:00Z' }}
        proofs={[{ id: 'p1', label: 'receipt.pdf', uploadedAt: '2026-01-01T00:00:00Z' }]}
        formatStamp={() => 'ONE WAY'}
      />,
    )
    expect(screen.getAllByText('ONE WAY')).toHaveLength(2)
  })
})

describe('EscrowDossier — public half vs private half', () => {
  it('renders the public half for everyone', () => {
    render(<EscrowDossier {...base} />)
    expect(screen.getByText('Design a flyer')).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument() // the timeline spine
  })

  it('renders NO private half for an outsider — the anonymous SSR shape', () => {
    // Exactly what lib/escrow-detail-scope.ts sends someone who is not a
    // party: every party field nulled.
    render(
      <EscrowDossier
        {...base}
        counterparty={null}
        proofs={null}
        dispute={null}
        isAssigned={false}
      />,
    )
    expect(privateHalf()).toBeNull()
    expect(screen.queryByText(DOSSIER_COPY.counterparty)).not.toBeInTheDocument()
    expect(screen.queryByText(DOSSIER_COPY.proofs)).not.toBeInTheDocument()
    expect(screen.queryByText(DISPUTE_NOTICE_COPY.title)).not.toBeInTheDocument()
  })

  it('renders the private half for a party', () => {
    render(<EscrowDossier {...base} counterparty={PARTY} proofs={[]} />)
    expect(privateHalf()).not.toBeNull()
    expect(screen.getByText('Akin Beela')).toBeInTheDocument()
  })

  it('keeps the money and timeline public regardless of party scoping', () => {
    render(<EscrowDossier {...base} counterparty={null} />)
    expect(screen.getByText(DOSSIER_COPY.amountLabel)).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
  })
})
