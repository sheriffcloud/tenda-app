import { test, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { AdminEscrowDossier, DossierGigDetails, DossierParty, DossierProof } from '@tenda/shared'
import { DossierPanel } from '@/components/disputes/dossier'
import { PartyCard } from '@/components/disputes/dossier/party-card'
import { ProofsGallery } from '@/components/disputes/dossier/proofs-gallery'
import { StatusTimeline } from '@/components/disputes/dossier/status-timeline'
import { DetailsBlock } from '@/components/disputes/dossier/details-block'

/**
 * The gig half of a dossier. One builder so a new field on
 * `DossierGigDetails` lands in ONE place rather than in every test that
 * happened to spell the shape out.
 */
function gigDetails(over: Partial<DossierGigDetails> = {}): DossierGigDetails {
  return {
    title: 'Fix my sink',
    description: 'Leaky pipe',
    category: 'home',
    country: 'NG',
    city: 'Lagos',
    remote: false,
    proof_requirements: [],
    proof_params: null,
    requires_approval: false,
    assigned_from_application: false,
    applicant_count: 0,
    ...over,
  }
}

function dossier(over: Partial<AdminEscrowDossier> = {}): AdminEscrowDossier {
  return {
    escrow_id: 'e1',
    kind: 'gig',
    status: 'disputed',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '5000000',
    dispute_bond_raw: '0',
    created_at: '2026-06-10T00:00:00.000Z',
    parties: [
      { role: 'creator', user_id: 'p1', first_name: 'Ada', last_name: 'Lovelace', raised_dispute: false },
      { role: 'counterparty', user_id: 'p2', first_name: 'Tunde', last_name: 'Bello', raised_dispute: true },
    ],
    gig: gigDetails(),
    exchange: null,
    proofs: [],
    transactions: [],
    ...over,
  }
}

// ─── PartyCard ────────────────────────────────────────────────────────────────

test('PartyCard shows the kind-aware role, name, and links to the user', () => {
  const party: DossierParty = { role: 'counterparty', user_id: 'p2', first_name: 'Tunde', last_name: 'Bello', raised_dispute: true }
  render(<PartyCard party={party} kind="gig" />)
  expect(screen.getByText('Worker')).toBeInTheDocument()
  expect(screen.getByText('raised dispute')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Tunde Bello' })).toHaveAttribute('href', '/users/p2')
})

test('PartyCard uses Maker/Taker labels for exchanges and falls back on null names', () => {
  const party: DossierParty = { role: 'creator', user_id: 'abcdef12-9999', first_name: null, last_name: null, raised_dispute: false }
  render(<PartyCard party={party} kind="exchange" />)
  expect(screen.getByText('Maker')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /User abcdef12/ })).toBeInTheDocument()
  expect(screen.queryByText('raised dispute')).toBeNull()
})

// ─── ProofsGallery ────────────────────────────────────────────────────────────

const proof = (over: Partial<DossierProof> = {}): DossierProof => ({
  id: 'pr1', url: 'https://res.cloudinary.com/x.jpg', payload: null, type: 'image', uploaded_at: '2026-06-10T00:00:00.000Z', ...over,
})

test('ProofsGallery renders images, video/document tiles, and the fiat payment proof', () => {
  render(
    <ProofsGallery
      proofs={[proof({ id: 'a', type: 'image' }), proof({ id: 'b', type: 'video' }), proof({ id: 'c', type: 'document' })]}
      paymentProofUrl="https://res.cloudinary.com/pay.jpg"
    />,
  )
  // Payment proof + the image proof both render as <img>.
  expect(screen.getAllByRole('img')).toHaveLength(2)
  expect(screen.getByText('🎬')).toBeInTheDocument()
  expect(screen.getByText('📄')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Payment proof' })).toBeInTheDocument()
})

test('ProofsGallery renders a data proof as a payload card — values in full, not a tooltip', () => {
  // A mediator weighing a dispute needs the reported values themselves.
  render(
    <ProofsGallery
      proofs={[
        proof({ id: 'd1', type: 'structured', url: null, payload: { values: { count: 3, sealed: true } } }),
        proof({ id: 'd2', type: 'text', url: null, payload: { text: 'Left at the gate' } }),
        proof({ id: 'd3', type: 'geotag', url: null, payload: { latitude: 6.52443891, longitude: 3.37921234 } }),
      ]}
      paymentProofUrl={null}
    />,
  )
  expect(screen.getByText('count:')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.getByText('sealed:')).toBeInTheDocument()
  expect(screen.getByText('Yes')).toBeInTheDocument()
  expect(screen.getByText('Left at the gate')).toBeInTheDocument()
  expect(screen.getByText('6.52444, 3.37921')).toBeInTheDocument()
  // No dead link and no image for a payload.
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByRole('img')).toBeNull()
})

test('ProofsGallery renders a file proof with no url as an unlinked tile — never a dead link', () => {
  // `escrow_proofs.url` is nullable at the schema; a file row without one is
  // corrupt but must not throw the whole dossier.
  render(<ProofsGallery proofs={[proof({ id: 'v', type: 'video', url: null })]} paymentProofUrl={null} />)
  // The tile itself must be a <div>, not an href-less <a>: an anchor with no
  // href has no link ROLE either, so a role query alone cannot tell them apart.
  expect(screen.getByText('🎬').closest('a')).toBeNull()
  expect(screen.getByText('🎬').closest('div')).not.toBeNull()
})

test('ProofsGallery shows the empty state when there are no proofs at all', () => {
  render(<ProofsGallery proofs={[]} paymentProofUrl={null} />)
  expect(screen.getByText('No proofs submitted.')).toBeInTheDocument()
})

test('ProofsGallery ignores an empty-string payment proof url', () => {
  render(<ProofsGallery proofs={[]} paymentProofUrl="" />)
  expect(screen.getByText('No proofs submitted.')).toBeInTheDocument()
})

// ─── StatusTimeline ───────────────────────────────────────────────────────────

test('StatusTimeline renders humanised tx types with formatted amounts', () => {
  render(
    <StatusTimeline
      asset="USDC_SOL"
      transactions={[
        { id: 't1', type: 'create', tx_ref: 'r1', amount_raw: '5000000', platform_fee_raw: null, creator_payout_raw: null, actor_id: 'p1', created_at: '2026-06-10T00:00:00.000Z' },
        { id: 't2', type: 'claim_stalled', tx_ref: 'r2', amount_raw: null, platform_fee_raw: null, creator_payout_raw: null, actor_id: null, created_at: '2026-06-11T00:00:00.000Z' },
      ]}
    />,
  )
  expect(screen.getByText('create')).toBeInTheDocument()
  expect(screen.getByText('claim stalled')).toBeInTheDocument()
  expect(screen.getByText(/5 USDC/)).toBeInTheDocument()
})

test('StatusTimeline shows an empty state with no transactions', () => {
  render(<StatusTimeline asset="USDC_SOL" transactions={[]} />)
  expect(screen.getByText('No on-chain transactions yet.')).toBeInTheDocument()
})

// ─── DetailsBlock ─────────────────────────────────────────────────────────────

test('DetailsBlock renders gig details and remote location', () => {
  render(<DetailsBlock dossier={dossier({ gig: gigDetails({ title: 'Design a logo', description: null, category: 'design', country: null, city: null, remote: true }) })} />)
  expect(screen.getByText('Design a logo')).toBeInTheDocument()
  expect(screen.getByText('Remote')).toBeInTheDocument()
})

test('DetailsBlock renders exchange details when gig is null', () => {
  render(
    <DetailsBlock
      dossier={dossier({
        kind: 'exchange',
        gig: null,
        exchange: { fiat_amount: '15000.00', fiat_currency: 'NGN', rate: '1500.00', payment_window_seconds: 1800, payment_proof_url: null },
      })}
    />,
  )
  expect(screen.getByText('15000.00 NGN')).toBeInTheDocument()
  expect(screen.getByText('30 min')).toBeInTheDocument()
})

test('DetailsBlock degrades gracefully when neither detail record exists', () => {
  render(<DetailsBlock dossier={dossier({ gig: null, exchange: null })} />)
  expect(screen.getByText('No detail record for this escrow.')).toBeInTheDocument()
})

// ─── DossierPanel (composition) ───────────────────────────────────────────────

test('DossierPanel composes headline, parties, details, proofs, and timeline', () => {
  render(<DossierPanel dossier={dossier({ dispute_bond_raw: '1000000' })} />)
  expect(screen.getByText(/5 USDC/)).toBeInTheDocument()
  expect(screen.getByText('solana:devnet')).toBeInTheDocument()
  expect(screen.getByText(/Bond/)).toBeInTheDocument() // non-zero bond surfaces
  expect(screen.getByText('Poster')).toBeInTheDocument()
  expect(screen.getByText('Worker')).toBeInTheDocument()
  expect(screen.getByText('Fix my sink')).toBeInTheDocument()
  expect(within(screen.getByText('Proofs').closest('div')!).getByText('No proofs submitted.')).toBeInTheDocument()
})

test('DossierPanel hides the bond line when the bond is zero', () => {
  render(<DossierPanel dossier={dossier({ dispute_bond_raw: '0' })} />)
  expect(screen.queryByText(/Bond/)).toBeNull()
})

test('DetailsBlock shows the proof the poster required', () => {
  render(
    <DetailsBlock
      dossier={dossier({
        gig: gigDetails({ description: null, proof_requirements: ['image', 'video'] }),
      })}
    />,
  )
  expect(screen.getByText('Required proof')).toBeInTheDocument()
  expect(screen.getByText('photo and video')).toBeInTheDocument()
})

test('DetailsBlock dashes the requirement row when the gig required nothing', () => {
  render(<DetailsBlock dossier={dossier()} />)
  expect(screen.getByText('Required proof')).toBeInTheDocument()
  expect(screen.getByText('—')).toBeInTheDocument()
})

// ─── Acceptance mode (Stage 10) ───────────────────────────────────────────────

/**
 * A mediator judging abandonment has to know whether the worker CHOSE this gig
 * or was placed in it: only a worker who raised their hand is held to it, and
 * `assigned_from_application` is the very flag that rule reads.
 */
function approvalGig(over: Partial<DossierGigDetails> = {}): DossierGigDetails {
  return gigDetails({
    requires_approval: true,
    assigned_from_application: true,
    applicant_count: 7,
    ...over,
  })
}

test('DetailsBlock reports an approval-mode gig, its applicants, and how the worker got there', () => {
  render(<DetailsBlock dossier={dossier({ gig: approvalGig() })} />)
  expect(screen.getByText('Poster approval')).toBeInTheDocument()
  expect(screen.getByText('7')).toBeInTheDocument()
  expect(screen.getByText('Yes — they applied first')).toBeInTheDocument()
})

test('DetailsBlock distinguishes a directly-assigned worker from one who applied', () => {
  render(<DetailsBlock dossier={dossier({ gig: approvalGig({ assigned_from_application: false }) })} />)
  // The distinction is the whole point: a back-door assignment earns no strike.
  expect(screen.getByText('No — assigned directly')).toBeInTheDocument()
})

test('DetailsBlock names first-come gigs and omits the approval-only rows', () => {
  render(<DetailsBlock dossier={dossier({ gig: approvalGig({ requires_approval: false }) })} />)
  expect(screen.getByText('First come, first served')).toBeInTheDocument()
  // Applicants and provenance are meaningless without the mode, so they go.
  expect(screen.queryByText('Applicants')).toBeNull()
  expect(screen.queryByText('Worker applied')).toBeNull()
})
