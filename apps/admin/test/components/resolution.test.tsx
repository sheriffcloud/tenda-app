import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import type { AdminResolutionView, ResolutionQueueRow } from '@tenda/shared'
import { ProposeForm } from '@/components/disputes/resolution/propose-form'
import { RejectAction } from '@/components/disputes/resolution/reject-action'
import { ResolutionPanel } from '@/components/disputes/resolution/resolution-panel'
import { ResolutionQueueTable } from '@/components/disputes/resolution/resolution-queue-table'
import { adminApi } from '@/api/client'
import { setSession } from '@/lib/auth'

vi.mock('@/api/client', () => ({
  adminApi: {
    disputes: { getResolution: vi.fn(), propose: vi.fn() },
    resolutions: { reject: vi.fn() },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const propose = vi.mocked(adminApi.disputes.propose)
const reject = vi.mocked(adminApi.resolutions.reject)
const getResolution = vi.mocked(adminApi.disputes.getResolution)

function resolution(over: Partial<AdminResolutionView> = {}): AdminResolutionView {
  return {
    id: 'r1', dispute_id: 'd1', proposed_winner: 'creator', proposed_by: 'm1',
    status: 'pending', threshold: 1, reject_reason: null, rejected_by: null,
    resolved_tx_ref: null, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
    chain_id: 'solana:devnet', dispute_admin_authority: 'C9PXauthority',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setSession('jwt', { id: 'me', role: 'super_admin', first_name: 'S', last_name: 'A' })
})

// ─── ProposeForm ──────────────────────────────────────────────────────────────

test('ProposeForm lists kind-aware outcomes and proposes the chosen winner', async () => {
  propose.mockResolvedValueOnce(resolution({ proposed_winner: 'counterparty' }))
  const onProposed = vi.fn()
  render(<ProposeForm disputeId="d1" kind="gig" onProposed={onProposed} />)
  // gig labels: Poster / Worker / Split evenly.
  expect(screen.getByRole('option', { name: 'Poster' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Worker' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Split evenly' })).toBeInTheDocument()

  await userEvent.selectOptions(screen.getByRole('combobox'), 'counterparty')
  await userEvent.click(screen.getByRole('button', { name: 'Propose' }))
  await waitFor(() => expect(propose).toHaveBeenCalledWith('d1', 'counterparty'))
  expect(onProposed).toHaveBeenCalled()
})

test('ProposeForm surfaces a proposal error', async () => {
  propose.mockRejectedValueOnce(new Error('nope'))
  render(<ProposeForm disputeId="d1" kind="exchange" onProposed={vi.fn()} />)
  // exchange labels differ (Maker / Taker) — proves kind drives copy.
  expect(screen.getByRole('option', { name: 'Maker' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Propose' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalled())
})

// ─── RejectAction ─────────────────────────────────────────────────────────────

test('RejectAction reveals a reason box and rejects with the reason', async () => {
  reject.mockResolvedValueOnce(resolution({ status: 'rejected' }))
  const onRejected = vi.fn()
  render(<RejectAction resolutionId="r1" onRejected={onRejected} />)
  await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
  const box = screen.getByPlaceholderText('Why is this proposal wrong?')
  // Confirm is disabled until a reason is typed.
  expect(screen.getByRole('button', { name: 'Confirm reject' })).toBeDisabled()
  await userEvent.type(box, 'Proofs favour the worker')
  await userEvent.click(screen.getByRole('button', { name: 'Confirm reject' }))
  await waitFor(() => expect(reject).toHaveBeenCalledWith('r1', 'Proofs favour the worker'))
  expect(onRejected).toHaveBeenCalled()
})

// ─── ResolutionPanel ──────────────────────────────────────────────────────────

test('ResolutionPanel: no proposal + canPropose shows the propose form', async () => {
  getResolution.mockResolvedValue(null)
  render(<ResolutionPanel disputeId="d1" kind="gig" canPropose />)
  expect(await screen.findByRole('button', { name: 'Propose' })).toBeInTheDocument()
})

test('ResolutionPanel: no proposal without canPropose shows a placeholder, no form', async () => {
  getResolution.mockResolvedValue(null)
  render(<ResolutionPanel disputeId="d1" kind="gig" canPropose={false} />)
  expect(await screen.findByText('No resolution proposed yet.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Propose' })).toBeNull()
})

test('ResolutionPanel: a pending proposal shows the outcome and (for signers) Reject', async () => {
  getResolution.mockResolvedValue(resolution({ proposed_winner: 'counterparty', status: 'pending' }))
  render(<ResolutionPanel disputeId="d1" kind="gig" canPropose={false} />)
  expect(await screen.findByText('Worker')).toBeInTheDocument()
  expect(screen.getByText('awaiting signature')).toBeInTheDocument()
  // super_admin holds disputes.execute → Reject is available.
  expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
})

test('ResolutionPanel: a mediator (no execute perm) sees the proposal but no Reject', async () => {
  setSession('jwt', { id: 'me', role: 'dispute_admin', first_name: 'D', last_name: 'A' })
  getResolution.mockResolvedValue(resolution({ status: 'pending' }))
  render(<ResolutionPanel disputeId="d1" kind="gig" canPropose={false} />)
  expect(await screen.findByText('awaiting signature')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
})

test('ResolutionPanel: a confirmed proposal shows the resolved outcome', async () => {
  getResolution.mockResolvedValue(resolution({ status: 'confirmed', proposed_winner: 'split' }))
  render(<ResolutionPanel disputeId="d1" kind="gig" canPropose={false} />)
  expect(await screen.findByText(/resolved · Split evenly/)).toBeInTheDocument()
})

test('ResolutionPanel: a rejected proposal shows the reason and re-propose form', async () => {
  getResolution.mockResolvedValue(resolution({ status: 'rejected', reject_reason: 'reconsider' }))
  render(<ResolutionPanel disputeId="d1" kind="gig" canPropose />)
  expect(await screen.findByText(/Previous proposal rejected — reconsider/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Propose' })).toBeInTheDocument()
})

// ─── ResolutionQueueTable ─────────────────────────────────────────────────────

const queueRow = (over: Partial<ResolutionQueueRow> = {}): ResolutionQueueRow => ({
  ...resolution(), escrow_id: 'e1', kind: 'gig', subject_title: 'Fix my sink', ...over,
})

test('ResolutionQueueTable renders rows linking to the dispute', () => {
  render(<ResolutionQueueTable rows={[queueRow({ proposed_winner: 'creator' })]} />)
  expect(screen.getByRole('link', { name: 'Fix my sink' })).toHaveAttribute('href', '/disputes/d1')
  expect(screen.getByText('Poster')).toBeInTheDocument()
})

test('ResolutionQueueTable shows an empty state', () => {
  render(<ResolutionQueueTable rows={[]} />)
  expect(screen.getByText('No proposals awaiting signature.')).toBeInTheDocument()
})
