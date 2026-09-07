/**
 * The exchange CTA matrix over the SHARED visibility helpers — each seat ×
 * status yields exactly the mobile set: strangers accept open offers,
 * declining survives for invitees, the buyer marks paid, the seller
 * confirms or disputes, claim beats add-proof past the deadline, disputed
 * buyers add evidence, settled parties review once.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ExchangeCTA } from '@/components/exchange/ExchangeCTA'
import { makeExchangeDetail, makeUserRef } from '../../../test/factories/exchange'

const noop = { busy: false, onTxAction: vi.fn(), onSheet: vi.fn() }

test('a stranger can accept an open offer; the creator cancels instead', async () => {
  const offer = makeExchangeDetail()
  const onTxAction = vi.fn()
  render(<ExchangeCTA offer={offer} userId="stranger" {...noop} onTxAction={onTxAction} />)
  await userEvent.click(screen.getByRole('button', { name: 'Accept Offer' }))
  expect(onTxAction).toHaveBeenCalledWith('accept')

  render(<ExchangeCTA offer={offer} userId="seller-1" {...noop} />)
  expect(screen.getByRole('button', { name: 'Cancel Offer' })).toBeInTheDocument()
})

test('a direct invitee gets Accept AND Decline; a hidden offer keeps only Decline', () => {
  const invited = makeExchangeDetail({
    is_assigned: true,
    assigned_counterparty_id: 'buyer-1',
  })
  render(<ExchangeCTA offer={invited} userId="buyer-1" {...noop} />)
  expect(screen.getByRole('button', { name: 'Accept Offer' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()

  const hidden = makeExchangeDetail({
    is_assigned: true,
    assigned_counterparty_id: 'buyer-1',
    hidden: true,
  })
  render(<ExchangeCTA offer={hidden} userId="buyer-1" {...noop} />)
  expect(screen.queryAllByRole('button', { name: 'Accept Offer' })).toHaveLength(1) // only from the first render
  expect(screen.getAllByRole('button', { name: 'Decline' }).length).toBeGreaterThanOrEqual(2)
})

test('accepted: the buyer marks paid; submitted: the seller confirms or disputes', () => {
  const accepted = makeExchangeDetail({
    status: 'accepted',
    counterparty: makeUserRef({ id: 'buyer-1' }),
  })
  render(<ExchangeCTA offer={accepted} userId="buyer-1" {...noop} />)
  expect(screen.getByRole('button', { name: 'Mark as Paid' })).toBeInTheDocument()

  const submitted = makeExchangeDetail({
    status: 'submitted',
    counterparty: makeUserRef({ id: 'buyer-1' }),
  })
  render(<ExchangeCTA offer={submitted} userId="seller-1" {...noop} />)
  expect(screen.getByRole('button', { name: 'Confirm & Release' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dispute' })).toBeInTheDocument()
})

test('submitted buyer pairs Add More Proof with Dispute; disputed buyer adds evidence only', () => {
  const submitted = makeExchangeDetail({
    status: 'submitted',
    counterparty: makeUserRef({ id: 'buyer-1' }),
  })
  render(<ExchangeCTA offer={submitted} userId="buyer-1" {...noop} />)
  expect(screen.getByRole('button', { name: 'Add More Proof' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dispute' })).toBeInTheDocument()

  const disputed = makeExchangeDetail({
    status: 'disputed',
    counterparty: makeUserRef({ id: 'buyer-1' }),
  })
  render(<ExchangeCTA offer={disputed} userId="buyer-1" {...noop} />)
  expect(screen.getByRole('button', { name: 'Add Evidence' })).toBeInTheDocument()
})

test('cancel and dispute carry the SOLID danger treatment on the exchange surface', () => {
  // Mobile's ExchangeCTA maps BOTH to `danger` — unlike the gig, where the
  // dispute entry stays a restrained outline. Contesting a fiat transfer the
  // platform never saw is the gravest move on this page.
  // Boundary-anchored: the hover class carries the same substring, so a
  // plain toContain stays green with the base fill gone (mutation-proven).
  const SOLID_DANGER = /(?:^| )bg-feedback-danger-solid(?: |$)/
  const open = makeExchangeDetail()
  render(<ExchangeCTA offer={open} userId="seller-1" {...noop} />)
  expect(screen.getByRole('button', { name: 'Cancel Offer' }).className).toMatch(SOLID_DANGER)

  const submitted = makeExchangeDetail({
    status: 'submitted',
    counterparty: makeUserRef({ id: 'buyer-1' }),
  })
  render(<ExchangeCTA offer={submitted} userId="seller-1" {...noop} />)
  expect(screen.getByRole('button', { name: 'Dispute' }).className).toMatch(SOLID_DANGER)
})

test('past the approval deadline the buyer claims — claim WINS over add-proof', () => {
  const stalled = makeExchangeDetail({
    status: 'submitted',
    counterparty: makeUserRef({ id: 'buyer-1' }),
    approval_deadline: new Date(Date.now() - 60_000).toISOString(),
  })
  const onTxAction = vi.fn()
  render(<ExchangeCTA offer={stalled} userId="buyer-1" {...noop} onTxAction={onTxAction} />)
  expect(screen.getByRole('button', { name: 'Claim Crypto' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add More Proof' })).toBeNull()
})

test('draft creator publishes or deletes; completed party reviews exactly once', () => {
  const draft = makeExchangeDetail({ status: 'draft' })
  render(<ExchangeCTA offer={draft} userId="seller-1" {...noop} />)
  expect(screen.getByRole('button', { name: 'Publish Offer' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Delete Draft' })).toBeInTheDocument()

  const completed = makeExchangeDetail({
    status: 'completed',
    counterparty: makeUserRef({ id: 'buyer-1' }),
  })
  render(<ExchangeCTA offer={completed} userId="seller-1" {...noop} />)
  expect(screen.getByRole('button', { name: 'Leave Review' })).toBeInTheDocument()
})

/**
 * The matrix above asserts which buttons EXIST. This asserts what they do.
 *
 * Without it, "Confirm & Release" wired to `onTxAction('cancel')` — release
 * the crypto vs refund it — passes every test in this file, because the label
 * is right and the label is all that was checked.
 */
const CLICKS: {
  label: string
  offer: Parameters<typeof makeExchangeDetail>[0]
  userId: string
  raises: { tx?: string; sheet?: string }
}[] = [
  { label: 'Accept Offer', offer: {}, userId: 'stranger', raises: { tx: 'accept' } },
  { label: 'Cancel Offer', offer: {}, userId: 'seller-1', raises: { tx: 'cancel' } },
  {
    label: 'Decline',
    offer: { is_assigned: true, assigned_counterparty_id: 'buyer-1' },
    userId: 'buyer-1',
    raises: { tx: 'decline' },
  },
  { label: 'Publish Offer', offer: { status: 'draft' }, userId: 'seller-1', raises: { tx: 'create' } },
  { label: 'Delete Draft', offer: { status: 'draft' }, userId: 'seller-1', raises: { sheet: 'delete' } },
  {
    label: 'Mark as Paid',
    offer: { status: 'accepted', counterparty: makeUserRef({ id: 'buyer-1' }) },
    userId: 'buyer-1',
    raises: { sheet: 'proof' },
  },
  {
    label: 'Confirm & Release',
    offer: { status: 'submitted', counterparty: makeUserRef({ id: 'buyer-1' }) },
    userId: 'seller-1',
    raises: { tx: 'approve' },
  },
  {
    label: 'Dispute',
    offer: { status: 'submitted', counterparty: makeUserRef({ id: 'buyer-1' }) },
    userId: 'seller-1',
    raises: { sheet: 'dispute' },
  },
  {
    label: 'Add More Proof',
    offer: { status: 'submitted', counterparty: makeUserRef({ id: 'buyer-1' }) },
    userId: 'buyer-1',
    raises: { sheet: 'addProof' },
  },
  {
    label: 'Claim Crypto',
    offer: {
      status: 'submitted',
      counterparty: makeUserRef({ id: 'buyer-1' }),
      approval_deadline: new Date('2020-01-01T00:00:00.000Z').toISOString(),
    },
    userId: 'buyer-1',
    raises: { tx: 'claim_stalled' },
  },
  {
    label: 'Leave Review',
    offer: { status: 'completed', counterparty: makeUserRef({ id: 'buyer-1' }) },
    userId: 'seller-1',
    raises: { sheet: 'review' },
  },
]

test.each(CLICKS)('$label raises exactly its own move', async ({ label, offer, userId, raises }) => {
  const onTxAction = vi.fn()
  const onSheet = vi.fn()
  const view = render(
    <ExchangeCTA
      offer={makeExchangeDetail(offer)}
      userId={userId}
      busy={false}
      onTxAction={onTxAction}
      onSheet={onSheet}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: label }))

  if (raises.tx !== undefined) {
    expect(onTxAction).toHaveBeenCalledWith(raises.tx)
    expect(onSheet).not.toHaveBeenCalled()
  } else {
    expect(onSheet).toHaveBeenCalledWith(raises.sheet)
    expect(onTxAction).not.toHaveBeenCalled()
  }
  view.unmount()
})

test('a stranger on a SETTLED offer is offered nothing, not a dead button', () => {
  // The final `return null`. Every other branch renders a control; this is the
  // seat/status pair where the honest answer is no control at all.
  const settled = makeExchangeDetail({
    status: 'completed',
    counterparty: makeUserRef({ id: 'buyer-1' }),
  })
  const { container } = render(<ExchangeCTA offer={settled} userId="stranger" {...noop} />)
  expect(container.querySelectorAll('button')).toHaveLength(0)
})
