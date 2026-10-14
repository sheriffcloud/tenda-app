/**
 * The two branch renderers, branch by branch — each draws the SHARED copy
 * and raises the right callback. Which branches APPLY is the shared matrix's
 * job; this file only guards that every drawable branch actually draws.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import {
  applicantsCtaLabel,
  applicationStatusLine,
  type LifecycleBranch,
} from '@tenda/shared'
import { ApprovalCTA } from '@/components/gig/detail/ApprovalCTA'
import { LifecycleCTA } from '@/components/gig/detail/LifecycleCTA'
import { WORKER_ID, gigDetail, userRef } from './fixtures'

describe('LifecycleCTA', () => {
  const renderBranch = (branch: LifecycleBranch, isTxBuilding = false) => {
    const h = { onAction: vi.fn(), onTxAction: vi.fn(), onRetryDraft: vi.fn() }
    render(
      <LifecycleCTA branch={branch} isTxBuilding={isTxBuilding} width="full" {...h} />,
    )
    return h
  }

  test('every tx branch raises its exact EscrowTxType', () => {
    const cases: [LifecycleBranch, string, string][] = [
      ['refundExpired', 'Claim Refund', 'refund_expired'],
      ['accept', 'Accept Gig', 'accept'],
      ['decline', 'Decline', 'decline'],
      ['cancel', 'Cancel Gig', 'cancel'],
      ['approve', 'Approve & Pay', 'approve'],
      ['claimStalled', 'Claim Payment', 'claim_stalled'],
      ['reclaim', 'Reclaim Escrow', 'reclaim_abandoned'],
    ]
    for (const [branch, label, action] of cases) {
      const h = renderBranch(branch)
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(h.onTxAction).toHaveBeenCalledWith(action)
      cleanup()
    }
  })

  test('every sheet branch raises its sheet; addEvidence shares the addProof sheet', () => {
    const cases: [LifecycleBranch, string, string][] = [
      ['submit', 'Submit Proof', 'proof'],
      ['addProof', 'Add More Proof', 'addProof'],
      ['addEvidence', 'Add Evidence', 'addProof'],
      ['dispute', 'Dispute', 'dispute'],
      ['review', 'Leave Review', 'review'],
      ['deleteDraft', 'Delete Draft', 'delete'],
    ]
    for (const [branch, label, sheet] of cases) {
      const h = renderBranch(branch)
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(h.onAction).toHaveBeenCalledWith(sheet)
      cleanup()
    }
  })

  test('cancel is the SOLID danger commit; dispute stays a restrained outline', () => {
    // Mobile's per-branch mapping (gig-cta/LifecycleCTA): cancel unwinds a
    // funded escrow and dresses solid; opening the dispute EXPLANATION is not
    // itself destructive, so it does not.
    // Boundary-anchored: the hover class carries the same substring, so a
    // plain toContain stays green with the base fill gone (mutation-proven).
    const SOLID_DANGER = /(?:^| )bg-feedback-danger-solid(?: |$)/
    renderBranch('cancel')
    expect(screen.getByRole('button', { name: 'Cancel Gig' }).className).toMatch(SOLID_DANGER)
    cleanup()
    renderBranch('dispute')
    const dispute = screen.getByRole('button', { name: 'Dispute' })
    expect(dispute.className).toContain('border')
    expect(dispute.className).not.toMatch(SOLID_DANGER)
  })

  test('retryDraft raises the repost callback; tx-building disables the money buttons', () => {
    const h = renderBranch('retryDraft')
    fireEvent.click(screen.getByRole('button', { name: 'Edit & repost' }))
    expect(h.onRetryDraft).toHaveBeenCalled()
    cleanup()
    renderBranch('approve', true)
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()
  })
})

describe('ApprovalCTA', () => {
  const renderBranch = (
    branch: Parameters<typeof ApprovalCTA>[0]['branch'],
    gig = gigDetail({ requires_approval: true }),
    busy = false,
  ) => {
    const onAction = vi.fn()
    render(<ApprovalCTA branch={branch} gig={gig} busy={busy} width="full" onAction={onAction} />)
    return onAction
  }

  test('assign shows the applicant count and opens the shortlist', () => {
    const gig = gigDetail({
      requires_approval: true,
      viewer: { application: null, open_application_count: 3 },
    })
    const onAction = renderBranch('assign', gig)
    fireEvent.click(screen.getByRole('button', { name: applicantsCtaLabel(3) }))
    expect(onAction).toHaveBeenCalledWith('viewApplicants')
  })

  test('apply shows the status line for a settled application and raises apply', () => {
    const gig = gigDetail({
      requires_approval: true,
      viewer: {
        application: {
          id: 'a1',
          escrow_id: 'escrow-1',
          applicant_id: WORKER_ID,
          message: null,
          wallet_address: null,
          status: 'withdrawn',
          expires_at: '2026-07-02T00:00:00.000Z',
          created_at: '2026-07-01T00:00:00.000Z',
        },
        open_application_count: null,
      },
    })
    const onAction = renderBranch('apply', gig)
    expect(screen.getByText(applicationStatusLine('withdrawn', null))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply for this gig' }))
    expect(onAction).toHaveBeenCalledWith('apply')
  })

  test('withdraw states the open-application line and raises withdraw', () => {
    const gig = gigDetail({
      requires_approval: true,
      viewer: {
        application: {
          id: 'a1',
          escrow_id: 'escrow-1',
          applicant_id: WORKER_ID,
          message: null,
          wallet_address: null,
          status: 'open',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          created_at: '2026-07-01T00:00:00.000Z',
        },
        open_application_count: null,
      },
    })
    const onAction = renderBranch('withdraw', gig)
    expect(screen.getByText(new RegExp(applicationStatusLine('open', null)))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw application' }))
    expect(onAction).toHaveBeenCalledWith('withdraw')
  })

  test("release raises the worker's off-chain exit", () => {
    const onAction = renderBranch('release')
    fireEvent.click(screen.getByRole('button', { name: "I'm not available" }))
    expect(onAction).toHaveBeenCalledWith('release')
  })

  test('unassign renders the change-worker card while the window is open, nothing after', () => {
    const acceptedAt = Date.now() - 60_000
    const open = gigDetail({
      status: 'accepted',
      requires_approval: true,
      counterparty: userRef(WORKER_ID),
      completion_duration_seconds: 7 * 24 * 3600,
      completion_deadline: new Date(acceptedAt + 7 * 24 * 3600_000).toISOString(),
      unassign_window_seconds: 3600,
    })
    const onAction = renderBranch('unassign', open)
    fireEvent.click(screen.getByRole('button', { name: 'Release assignment' }))
    expect(onAction).toHaveBeenCalledWith('unassign')
    cleanup()

    const closed = gigDetail({
      status: 'accepted',
      requires_approval: true,
      counterparty: userRef(WORKER_ID),
      completion_duration_seconds: 7 * 24 * 3600,
      completion_deadline: new Date(acceptedAt + 7 * 24 * 3600_000).toISOString(),
      unassign_window_seconds: 1, // window long gone
    })
    const { container } = render(
      <ApprovalCTA branch="unassign" gig={closed} busy={false} width="full" onAction={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('the released-worker warning shows when the assignment was released', () => {
    const acceptedAt = Date.now() - 60_000
    const gig = gigDetail({
      status: 'accepted',
      requires_approval: true,
      counterparty: userRef(WORKER_ID),
      completion_duration_seconds: 7 * 24 * 3600,
      completion_deadline: new Date(acceptedAt + 7 * 24 * 3600_000).toISOString(),
      unassign_window_seconds: 3600,
      assignment_released_at: new Date(acceptedAt).toISOString(),
    })
    renderBranch('unassign', gig)
    expect(screen.getByText(/said they are not available/)).toBeInTheDocument()
  })

  test('lost states the outcome plainly; with no application it renders nothing', () => {
    const gig = gigDetail({
      requires_approval: true,
      viewer: {
        application: {
          id: 'a1',
          escrow_id: 'escrow-1',
          applicant_id: WORKER_ID,
          message: null,
          wallet_address: null,
          status: 'passed',
          expires_at: '2026-07-02T00:00:00.000Z',
          created_at: '2026-07-01T00:00:00.000Z',
        },
        open_application_count: null,
      },
    })
    renderBranch('lost', gig)
    expect(screen.getByText(applicationStatusLine('passed', null))).toBeInTheDocument()
    cleanup()
    const { container } = render(
      <ApprovalCTA
        branch="lost"
        gig={gigDetail({ requires_approval: true })}
        busy={false}
        width="full"
        onAction={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
