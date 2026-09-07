import { test, expect, vi, beforeEach } from 'vitest'
import { act, screen } from '@testing-library/react'
import type { AdminEscrowDossier, DisputeSummary, DisputeThreadResponse } from '@tenda/shared'
import { renderPage } from '../test-utils'
import DisputeDetailPage from '@/app/(dashboard)/disputes/[id]/page'
import { POLL_INTERVAL_MS } from '@/components/disputes/thread-view'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { setSession } from '@/lib/auth'

vi.mock('@/api/client', () => ({
  adminApi: {
    disputes: { get: vi.fn(), claim: vi.fn(), release: vi.fn(), getResolution: vi.fn(), propose: vi.fn() },
    disputeThread: { get: vi.fn(), send: vi.fn() },
    escrows: { dossier: vi.fn() },
    resolutions: { reject: vi.fn() },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const get = vi.mocked(adminApi.disputes.get)
const threadGet = vi.mocked(adminApi.disputeThread.get)
const dossierGet = vi.mocked(adminApi.escrows.dossier)
const resolutionGet = vi.mocked(adminApi.disputes.getResolution)

const dossier: AdminEscrowDossier = {
  escrow_id: 'e1', kind: 'gig', status: 'disputed', chain_id: 'solana:devnet',
  asset: 'USDC_SOL', amount_raw: '5000000', dispute_bond_raw: '0',
  created_at: '2026-06-10T00:00:00.000Z',
  parties: [{ role: 'creator', user_id: 'r1', first_name: 'R', last_name: 'X', raised_dispute: true }],
  gig: { title: 'Broken delivery', description: null, category: 'errands', country: null, city: null, remote: true, proof_requirements: [], requires_approval: false, assigned_from_application: false, applicant_count: 0 },
  exchange: null, proofs: [], transactions: [],
}

// Complete, uncast: the header names the mediator, and an `as` cast would let a
// missing name field arrive as `undefined` while the assertions stayed green.
function summary(over: Partial<DisputeSummary> = {}): DisputeSummary {
  return {
    dispute_id: 'p1', escrow_id: 'e1', kind: 'gig', subject_title: 'Broken delivery',
    reason: 'item never arrived', raised_by_id: 'r1', raised_by_first_name: 'R', raised_by_last_name: 'X',
    raised_at: '2026-06-10T00:00:00.000Z', assigned_to_id: null, assigned_to_first_name: null,
    assigned_to_last_name: null, assigned_at: null, winner: null, resolved_by_id: null,
    resolved_by_first_name: null, resolved_by_last_name: null, resolved_at: null,
    ...over,
  }
}
const emptyThread: DisputeThreadResponse = {
  dispute_id: 'p1', escrow_id: 'e1', assigned_to_id: null, read_only: false, context: null, messages: [], reads: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setSession('jwt', { id: 'me', role: 'dispute_admin', first_name: 'D', last_name: 'A' })
  threadGet.mockResolvedValue(emptyThread)
  dossierGet.mockResolvedValue(dossier)
  resolutionGet.mockResolvedValue(null)
})

test('renders the dispute header, unclaimed badge, claim button and thread', async () => {
  get.mockResolvedValue(summary())
  renderPage(<DisputeDetailPage />)
  expect(await screen.findByRole('heading', { name: 'Broken delivery' })).toBeInTheDocument()
  expect(screen.getByText('unclaimed')).toBeInTheDocument()
  expect(screen.getByText('item never arrived')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Claim' })).toBeInTheDocument()
})

test('loads and renders the mediation context panel beside the thread', async () => {
  get.mockResolvedValue(summary())
  renderPage(<DisputeDetailPage />)
  // Amount headline + a party role from the dossier confirm the panel wired in.
  expect(await screen.findByText(/5 USDC/)).toBeInTheDocument()
  expect(screen.getByText('Poster')).toBeInTheDocument()
  expect(dossierGet).toHaveBeenCalledWith('e1')
})

test('a 404 renders the not-found state', async () => {
  get.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'gone'))
  renderPage(<DisputeDetailPage />)
  expect(await screen.findByText(/Dispute not found/)).toBeInTheDocument()
})

test('the header names the mediator holding the case', async () => {
  get.mockResolvedValue(
    summary({ assigned_to_id: 'admin-a', assigned_to_first_name: 'Ada', assigned_to_last_name: 'Admin' }),
  )
  renderPage(<DisputeDetailPage />)
  expect(await screen.findByText('claimed · Ada Admin')).toBeInTheDocument()
})

test('after a handoff the header names the NEW mediator, never the previous one', async () => {
  // The back-feed regression. The thread poll is the freshest assignee source
  // but carries only an ID, so patching it into state in place would leave the
  // new mediator's id beside the OLD mediator's name. The page must refetch.
  //
  // The handoff is delivered on the SECOND poll on purpose: on mount the child
  // thread's poll and the parent's summary fetch race, and if the poll lands
  // first `setDispute` bails at its `prev === null` guard — a flaky test, not a
  // failing one. Distinct names on the two admins are what makes the wrong
  // outcome observable at all.
  get
    .mockResolvedValueOnce(
      summary({ assigned_to_id: 'admin-a', assigned_to_first_name: 'Ada', assigned_to_last_name: 'Admin' }),
    )
    .mockResolvedValueOnce(
      summary({ assigned_to_id: 'admin-b', assigned_to_first_name: 'Bola', assigned_to_last_name: 'Bello' }),
    )
  threadGet
    .mockResolvedValueOnce({ ...emptyThread, assigned_to_id: 'admin-a' })
    .mockResolvedValue({ ...emptyThread, assigned_to_id: 'admin-b' })

  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    renderPage(<DisputeDetailPage />)
    expect(await screen.findByText('claimed · Ada Admin')).toBeInTheDocument()

    // act() because advancing the poll drives state updates in two components.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    })

    expect(await screen.findByText('claimed · Bola Bello')).toBeInTheDocument()
    expect(screen.queryByText(/Ada Admin/)).not.toBeInTheDocument()
    // Pins the MECHANISM: the name came from a refetch, not from client state.
    // Coupled on purpose to the "refetch, don't patch" decision — if that is
    // ever revisited, this is the assertion to revisit with it.
    expect(get).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})
