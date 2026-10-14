/**
 * The poster's applicants page: the read states, the poster-only guard, and —
 * the reason this suite exists — the assign confirm gate's SIGNER wiring.
 *
 * The dialog itself is covered in TxConfirmDialog.test.tsx; what this suite
 * pins is the PAGE's wiring: the confirm must preview the signing wallet on
 * the escrow's chain, bound to the poster's `my_signer_address` (the assign
 * is chain-bound to the wallet the escrow was created with). This page
 * shipped without `chainId` once — the dialog rendered, the row silently
 * didn't — and no other suite could see that.
 */
import { Suspense } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { GigApplicant, GigDetail, TransactionProgressPhase } from '@tenda/shared'
import { deliveryGigDetail } from '@/e2e/fixtures/gigs'

const { assignMock, fetchGigDetailMock, clearPendingMock, toastMock, pushMock } = vi.hoisted(
  () => ({
    assignMock: vi.fn(),
    fetchGigDetailMock: vi.fn(),
    clearPendingMock: vi.fn(),
    toastMock: vi.fn(),
    pushMock: vi.fn(),
  }),
)

const GIG: GigDetail = {
  ...deliveryGigDetail,
  requires_approval: true,
  assigned_counterparty_id: null,
  counterparty: null,
  is_assigned: false,
  my_signer_address: 'PosterBoundWa11et',
}

const APPLICANT: GigApplicant = {
  id: 'app-1',
  escrow_id: GIG.escrow_id,
  applicant_id: 'user-worker-1',
  message: 'I do this route daily.',
  status: 'open',
  expires_at: '2030-01-01T12:00:00.000Z',
  created_at: '2026-08-20T08:00:00.000Z',
  first_name: 'Bola',
  last_name: 'Ade',
  avatar_url: null,
  review_score: null,
}

// Mutable holders so each test can shape the page's world before rendering.
const gigsState: {
  selectedGig: GigDetail | null
  error: { id: string; message: string } | null
} = { selectedGig: GIG, error: null }
const authState = { userId: 'user-poster-1' }
const actionsState: {
  busyAction: string | null
  pendingTxRef: string | null
  pendingAction: string | null
  phase: TransactionProgressPhase
  activeAction: string | null
} = { busyAction: null, pendingTxRef: null, pendingAction: null, phase: 'idle', activeAction: null }

interface MonitorProps {
  onConfirmed: () => void
  onFailed: (msg: string) => void
}
const monitorProps: { current: MonitorProps | null } = { current: null }

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/components/ui/Toast', () => ({
  showToast: (...a: unknown[]) => toastMock(...a),
}))
vi.mock('@/api/client', () => ({ api: { gigs: { get: vi.fn() } } }))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: { user: { id: string } }) => unknown) =>
    sel({ user: { id: authState.userId } }),
}))
vi.mock('@/stores/gigs.store', () => ({
  useGigsStore: (
    sel: (s: {
      selectedGig: GigDetail | null
      error: { id: string; message: string } | null
      fetchGigDetail: typeof fetchGigDetailMock
    }) => unknown,
  ) =>
    sel({
      selectedGig: gigsState.selectedGig,
      error: gigsState.error,
      fetchGigDetail: fetchGigDetailMock,
    }),
}))
vi.mock('@/hooks/escrow/live', () => ({ useEscrowLiveRefresh: vi.fn() }))
vi.mock('@/hooks/gig/useApplications', () => ({
  useApplicantList: () => ({ applicants: [APPLICANT], error: null, load: vi.fn() }),
}))
vi.mock('@/hooks/escrow/useEscrowActions', () => ({
  useEscrowActions: () => ({ ...actionsState, clearPending: clearPendingMock, assign: assignMock }),
}))
vi.mock('@/components/wallet/SigningWalletRow', () => ({
  SigningWalletRow: ({ chainId, bound }: { chainId: string; bound?: string | null }) => (
    <div data-testid="signer-row">
      {chainId}
      {bound !== undefined && bound !== null ? ` bound ${bound}` : ''}
    </div>
  ),
}))
vi.mock('@/components/escrow/TransactionMonitor', () => ({
  TransactionMonitor: (props: MonitorProps) => {
    monitorProps.current = props
    return <div data-testid="monitor" />
  },
}))

import ApplicantsPage from '../page'

/**
 * A promise `use()` can read WITHOUT suspending: React first checks the
 * thenable's `status`/`value` fields, and a pre-fulfilled one resolves
 * synchronously — an untracked bare promise suspends forever under jsdom.
 */
function fulfilledParams(escrowId: string): Promise<{ escrowId: string }> {
  const value = { escrowId }
  const p = Promise.resolve(value) as Promise<typeof value> & {
    status: string
    value: typeof value
  }
  p.status = 'fulfilled'
  p.value = value
  return p
}

function renderPage() {
  render(
    <Suspense fallback={null}>
      <ApplicantsPage params={fulfilledParams(GIG.escrow_id)} />
    </Suspense>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  gigsState.selectedGig = GIG
  gigsState.error = null
  authState.userId = 'user-poster-1'
  actionsState.busyAction = null
  actionsState.pendingTxRef = null
  actionsState.pendingAction = null
  actionsState.phase = 'idle'
  actionsState.activeAction = null
  monitorProps.current = null
})

describe('read states', () => {
  test('shows Loading until the store holds THIS gig', async () => {
    gigsState.selectedGig = null
    renderPage()
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
  })

  test('a failed read for THIS id shows the failure, not the spinner', async () => {
    gigsState.selectedGig = null
    gigsState.error = { id: GIG.escrow_id, message: 'Gig unavailable' }
    renderPage()
    expect(await screen.findByText('Gig unavailable')).toBeInTheDocument()
  })

  test('anyone but the poster is told the shortlist is not theirs', async () => {
    authState.userId = 'user-stranger-1'
    renderPage()
    expect(
      await screen.findByText('Only the poster can see who applied to a gig.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Bola Ade')).toBeNull()
  })
})

describe('assign confirm gate', () => {
  test('previews the signing wallet on the escrow chain, bound to the poster', async () => {
    renderPage()
    await screen.findByText('Bola Ade')
    expect(screen.queryByTestId('signer-row')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Assign this worker' }))
    expect(screen.getByTestId('signer-row')).toHaveTextContent(
      `${GIG.chain_id} bound PosterBoundWa11et`,
    )
  })

  test('confirming fires the assign for exactly the picked applicant', async () => {
    renderPage()
    await screen.findByText('Bola Ade')
    fireEvent.click(screen.getByRole('button', { name: 'Assign this worker' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign Worker' }))
    expect(assignMock).toHaveBeenCalledWith('user-worker-1')
  })

  test('cancelling assigns nobody and closes the gate', async () => {
    renderPage()
    await screen.findByText('Bola Ade')
    fireEvent.click(screen.getByRole('button', { name: 'Assign this worker' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(assignMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('signer-row')).toBeNull()
  })
})

describe('transaction monitor', () => {
  test('mounts only while a transaction is in flight, and lands on the gig on confirm', async () => {
    renderPage()
    await screen.findByText('Bola Ade')
    expect(screen.queryByTestId('monitor')).toBeNull()

    actionsState.phase = 'confirming'
    actionsState.pendingTxRef = 'sig-1'
    actionsState.pendingAction = 'assign_accept'
    actionsState.activeAction = 'assign_accept'
    fireEvent.click(screen.getByText('All')) // any state change re-renders
    expect(screen.getByTestId('monitor')).toBeInTheDocument()

    monitorProps.current?.onConfirmed()
    expect(clearPendingMock).toHaveBeenCalled()
    expect(fetchGigDetailMock).toHaveBeenCalledWith(GIG.escrow_id)
    expect(pushMock).toHaveBeenCalledWith(`/my-gigs/${GIG.escrow_id}`)
  })

  test('a failed watch clears the pending state and says the sync will catch up', async () => {
    actionsState.phase = 'confirming'
    actionsState.pendingTxRef = 'sig-1'
    renderPage()
    await screen.findByText('Bola Ade')
    monitorProps.current?.onFailed('')
    expect(clearPendingMock).toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith('info', 'Transaction pending, will sync when confirmed')
  })
})
