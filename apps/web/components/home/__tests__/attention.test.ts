/**
 * The attention rule: which of MY rows owe a step, from the lists the
 * dashboard already holds — and, as importantly, which do not.
 */
import { describe, expect, it } from 'vitest'
import type { EscrowListRow, GigSummary } from '@tenda/shared'
import { attentionItems } from '@/components/home/attention'
import { HOME_COPY } from '@/components/home/copy'
import { deliveryGig, photoGig } from '@/e2e/fixtures/gigs'

const ME = 'me'

function trade(over: Partial<EscrowListRow>): EscrowListRow {
  return {
    id: 'x1',
    kind: 'exchange',
    status: 'accepted',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '150000000',
    title: null,
    fiat_currency: 'KES',
    creator_id: 'seller',
    counterparty_id: ME,
    accept_deadline: null,
    created_at: '2026-09-01T10:00:00.000Z',
    ...over,
  }
}

const run = (input: Partial<Parameters<typeof attentionItems>[0]>) =>
  attentionItems({ posted: [], working: [], trades: [], userId: ME, copy: HOME_COPY.attention, ...input })

describe('attentionItems', () => {
  it('asks the POSTER to approve a submitted proof, linking to the dossier', () => {
    const gig: GigSummary = { ...deliveryGig, status: 'submitted' }
    const [item] = run({ posted: [gig] })
    expect(item).toMatchObject({
      key: `approve:${gig.escrow_id}`,
      tone: 'warn',
      href: `/my-gigs/${gig.escrow_id}`,
      title: HOME_COPY.attention.approve(gig.title),
      postedAt: gig.created_at,
      acceptingUntil: null,
    })
  })

  it('tells the WORKER their proof is waiting, on the working tab', () => {
    const gig: GigSummary = { ...photoGig, status: 'submitted' }
    const [item] = run({ working: [gig] })
    expect(item).toMatchObject({
      key: `awaiting:${gig.escrow_id}`,
      href: `/my-gigs/${gig.escrow_id}?mine=working`,
      title: HOME_COPY.attention.awaiting(gig.title),
    })
  })

  it('surfaces an approval-mode gig taking applications, with its closing date, at the applicants page', () => {
    const gig: GigSummary = { ...photoGig, status: 'open', requires_approval: true, accept_deadline: '2026-09-05T18:00:00.000Z' }
    const [item] = run({ posted: [gig] })
    expect(item).toMatchObject({
      key: `applications:${gig.escrow_id}`,
      tone: 'brand',
      href: `/my-gigs/${gig.escrow_id}/applicants`,
      acceptingUntil: gig.accept_deadline,
    })
  })

  it('ignores an open DIRECT gig — nobody applies, nothing is owed', () => {
    expect(run({ posted: [{ ...deliveryGig, status: 'open', requires_approval: false }] })).toEqual([])
  })

  it('ignores settled, cancelled and merely accepted gigs', () => {
    for (const status of ['completed', 'cancelled', 'refunded', 'accepted', 'draft'] as const) {
      expect(run({ posted: [{ ...deliveryGig, status }], working: [{ ...photoGig, status }] })).toEqual([])
    }
  })

  it('surfaces a trade waiting on MY transfer — accepted, and I am the counterparty', () => {
    const row = trade({})
    const [item] = run({ trades: [row] })
    expect(item).toMatchObject({ key: 'trade:x1', tone: 'live', href: '/exchange/x1', title: HOME_COPY.attention.trade })
    expect(item.escrow).toEqual({ kind: 'exchange', row })
  })

  it('does not ask the SELLER for a transfer, nor for a trade in any other state', () => {
    expect(run({ trades: [trade({ creator_id: ME, counterparty_id: 'buyer' })] })).toEqual([])
    expect(run({ trades: [trade({ status: 'open', counterparty_id: null })] })).toEqual([])
    expect(run({ trades: [trade({ status: 'submitted' })] })).toEqual([])
    expect(run({ trades: [trade({ kind: 'gig' })] })).toEqual([])
  })

  it('keeps posted items before working items before trades, and never invents a name or a count', () => {
    const items = run({
      posted: [{ ...deliveryGig, status: 'submitted' }],
      working: [{ ...photoGig, status: 'submitted' }],
      trades: [trade({})],
    })
    expect(items.map((item) => item.key.split(':')[0])).toEqual(['approve', 'awaiting', 'trade'])
    for (const item of items) {
      expect(item.title).not.toMatch(/applicant|Ngozi|Kwame/i)
    }
  })
})
