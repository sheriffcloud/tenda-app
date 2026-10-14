/**
 * GigCTABar (web) — the wiring layer over the SHARED rules (which are
 * matrix-tested in shared): representative arrangements render the right
 * controls, each control raises the right callback, and an in-flight tx
 * hides everything behind the wait notice.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

const { configState } = vi.hoisted(() => ({
  configState: { config: { grace_period_seconds: 3600 } as { grace_period_seconds: number } | null },
}))
vi.mock('@/stores/platform-config.store', () => ({
  usePlatformConfigStore: (selector: (s: typeof configState) => unknown) => selector(configState),
}))

import { GigCTABar } from '@/components/gig/detail/GigCTABar'
import { CREATOR_ID, STRANGER_ID, WORKER_ID, gigDetail, userRef } from './fixtures'

const handlers = () => ({
  onAction: vi.fn(),
  onTxAction: vi.fn(),
  onApprovalAction: vi.fn(),
  onRetryDraft: vi.fn(),
})

function renderBar(gig = gigDetail(), userId = STRANGER_ID, over: Partial<Parameters<typeof GigCTABar>[0]> = {}) {
  const h = handlers()
  render(
    <GigCTABar
      gig={gig}
      userId={userId}
      isTxBuilding={false}
      txInProgress={false}
      {...h}
      {...over}
    />,
  )
  return h
}

beforeEach(() => {
  configState.config = { grace_period_seconds: 3600 }
})

test('an open gig offers a worker Accept, raised through the TX channel', () => {
  const h = renderBar()
  fireEvent.click(screen.getByRole('button', { name: 'Accept Gig' }))
  expect(h.onTxAction).toHaveBeenCalledWith('accept')
})

test('the poster of an open gig gets Cancel; past the deadline, Claim Refund instead', () => {
  const h = renderBar(gigDetail(), CREATOR_ID)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Gig' }))
  expect(h.onTxAction).toHaveBeenCalledWith('cancel')
  cleanup()

  const expired = gigDetail({ accept_deadline: new Date(Date.now() - 3600_000).toISOString() })
  const h2 = renderBar(expired, CREATOR_ID)
  fireEvent.click(screen.getByRole('button', { name: 'Claim Refund' }))
  expect(h2.onTxAction).toHaveBeenCalledWith('refund_expired')
  expect(screen.queryByRole('button', { name: 'Cancel Gig' })).not.toBeInTheDocument()
})

test('a submitted gig gives the poster Approve & Pay with Dispute beside it', () => {
  const gig = gigDetail({ status: 'submitted', counterparty: userRef(WORKER_ID) })
  const h = renderBar(gig, CREATOR_ID)
  fireEvent.click(screen.getByRole('button', { name: 'Approve & Pay' }))
  expect(h.onTxAction).toHaveBeenCalledWith('approve')
  fireEvent.click(screen.getByRole('button', { name: 'Dispute' }))
  expect(h.onAction).toHaveBeenCalledWith('dispute')
})

test('the assigned worker gets Submit Proof through the sheet channel', () => {
  const gig = gigDetail({
    status: 'accepted',
    counterparty: userRef(WORKER_ID),
    completion_deadline: new Date(Date.now() + 3600_000).toISOString(),
  })
  const h = renderBar(gig, WORKER_ID)
  fireEvent.click(screen.getByRole('button', { name: 'Submit Proof' }))
  expect(h.onAction).toHaveBeenCalledWith('proof')
})

test('a draft offers its creator Edit & repost + Delete Draft', () => {
  const h = renderBar(gigDetail({ status: 'draft' }), CREATOR_ID)
  fireEvent.click(screen.getByRole('button', { name: 'Edit & repost' }))
  expect(h.onRetryDraft).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete Draft' }))
  expect(h.onAction).toHaveBeenCalledWith('delete')
})

test('an approval-mode gig routes Apply through the approval channel', () => {
  const h = renderBar(gigDetail({ requires_approval: true }), STRANGER_ID)
  fireEvent.click(screen.getByRole('button', { name: 'Apply for this gig' }))
  expect(h.onApprovalAction).toHaveBeenCalledWith('apply')
})

test('a disputed gig shows the notice, never a Dispute button', () => {
  const gig = gigDetail({ status: 'disputed', counterparty: userRef(WORKER_ID) })
  renderBar(gig, CREATOR_ID)
  expect(screen.getByText('Under review by admin')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Dispute' })).not.toBeInTheDocument()
})

test('an in-flight transaction hides every control behind the wait notice', () => {
  renderBar(gigDetail(), STRANGER_ID, { txInProgress: true })
  expect(screen.getByText(/Transaction in progress/)).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('the bar renders nothing at all for a stranger on a terminal gig', () => {
  const gig = gigDetail({ status: 'cancelled', counterparty: userRef(WORKER_ID) })
  const { container } = render(
    <GigCTABar
      gig={gig}
      userId={STRANGER_ID}
      isTxBuilding={false}
      txInProgress={false}
      {...handlers()}
    />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('a taken-down gig strips the way IN but keeps the poster their way out', () => {
  renderBar(gigDetail({ hidden: true }), STRANGER_ID)
  expect(screen.queryByRole('button', { name: 'Accept Gig' })).not.toBeInTheDocument()
  cleanup()

  const h = renderBar(gigDetail({ hidden: true }), CREATOR_ID)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Gig' }))
  expect(h.onTxAction).toHaveBeenCalledWith('cancel')
})
