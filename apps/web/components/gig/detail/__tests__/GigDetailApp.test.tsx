/**
 * GigDetailApp — the session-aware wrapper: anonymous keeps the sign-in CTA,
 * an authed session triggers the bearer refetch and swaps in the party
 * surface, and the interim (authed, refetch pending) renders neither.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { GigDetail, LinkedWallet } from '@tenda/shared'
import type { ToastType } from '@/components/ui/Toast'

const { authState, gigsState, configState, actionsState, capturedActionsArgs, toastMock, routerPush, uploadProofsMock } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: false,
    user: null as { id: string } | null,
    isLoading: false,
    loadSession: vi.fn(async () => {}),
    // The tx gate's SigningWalletRow reads these through useSigningWallet.
    wallets: [] as LinkedWallet[],
    ensureWallets: vi.fn(async () => {}),
  },
  gigsState: {
    selectedGig: null as GigDetail | null,
    error: null,
    fetchGigDetail: vi.fn(async () => {}),
    reviewEscrow: vi.fn(),
  },
  configState: { config: { grace_period_seconds: 3600, fee_bps: 250, seeker_fee_bps: 100 } },
  actionsState: {
    busyAction: null as string | null,
    pendingTxRef: null as string | null,
    pendingAction: null as 'cancel' | 'accept' | null,
    phase: 'idle',
    activeAction: null,
    clearPending: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    approve: vi.fn(),
    claim: vi.fn(),
    cancel: vi.fn(),
    refund: vi.fn(),
    unassign: vi.fn(),
    assign: vi.fn(),
    publish: vi.fn(),
    submit: vi.fn(),
    addProofs: vi.fn(),
    dispute: vi.fn(),
  },
  capturedActionsArgs: { current: null as null | { onStale?: () => void } },
  toastMock: vi.fn<(type: ToastType, message: string) => void>(),
  routerPush: vi.fn(),
  uploadProofsMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))
vi.mock('@/components/ui/Toast', () => ({
  showToast: (...args: Parameters<typeof toastMock>) => toastMock(...args),
}))
// The monitor's own confirm pipeline is unit-tested; here only the HUB's
// response to its exits is under test, so it is reduced to its two exits.
vi.mock('@/components/escrow/TransactionMonitor', () => ({
  TransactionMonitor: ({ onConfirmed, onFailed }: { onConfirmed: () => void; onFailed: (m: string) => void }) => (
    <div>
      <button onClick={onConfirmed}>monitor-confirm</button>
      <button onClick={() => onFailed('rpc gave up')}>monitor-fail</button>
    </div>
  ),
}))
// The Cloudinary leg is unit-tested in lib/uploads; here it is stubbed so the
// dialog's hand-off to the hook can be driven without a network upload.
vi.mock('@/lib/uploads/escrow-proofs', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/uploads/escrow-proofs')),
  uploadProofs: (...a: unknown[]) => uploadProofsMock(...a),
}))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: <T,>(selector: (state: typeof authState) => T): T => selector(authState),
}))
vi.mock('@/stores/gigs.store', () => ({
  useGigsStore: <T,>(selector: (state: typeof gigsState) => T): T => selector(gigsState),
}))
vi.mock('@/stores/platform-config.store', () => ({
  usePlatformConfigStore: Object.assign(
    <T,>(selector: (state: typeof configState) => T): T => selector(configState),
    { getState: () => ({ ...configState, fetch: vi.fn() }) },
  ),
}))
// The transaction plumbing is unit-tested on its own; here it is a
// controllable fake so the HUB's routing (action → hook call, confirm/fail
// exits, stale re-read) can be driven and asserted.
vi.mock('@/hooks/escrow/useEscrowActions', () => ({
  useEscrowActions: (args: { onStale?: () => void }) => {
    capturedActionsArgs.current = args
    return actionsState
  },
}))
vi.mock('@/hooks/escrow/useEscrowFee', () => ({
  useEscrowFee: () => ({ feeBps: 250, feePct: '2.50', feeRaw: null, netRaw: null }),
}))

import { GigDetailApp } from '@/components/gig/detail/GigDetailApp'
import { STRANGER_ID, WORKER_ID, gigDetail, userRef } from './fixtures'

beforeEach(() => {
  authState.isAuthenticated = false
  authState.user = null
  authState.isLoading = false
  gigsState.selectedGig = null
  gigsState.fetchGigDetail.mockClear()
  actionsState.pendingTxRef = null
  actionsState.pendingAction = null
  actionsState.clearPending.mockClear()
  actionsState.accept.mockClear()
  actionsState.submit.mockReset()
  uploadProofsMock.mockResolvedValue([{ url: 'https://cdn/a.jpg', type: 'image' }])
  toastMock.mockClear()
  routerPush.mockClear()
})

function renderAsWorkerOnOpenGig() {
  authState.isAuthenticated = true
  authState.user = { id: STRANGER_ID }
  gigsState.selectedGig = gigDetail()
  return render(<GigDetailApp initial={gigDetail()} />)
}

test('anonymous readers keep the sign-in CTA and never trigger a bearer fetch', () => {
  render(<GigDetailApp initial={gigDetail()} />)
  expect(screen.getByRole('link', { name: 'Sign in to accept' })).toBeInTheDocument()
  expect(gigsState.fetchGigDetail).not.toHaveBeenCalled()
})

test('an expired open gig does not offer apply or accept', () => {
  render(<GigDetailApp initial={gigDetail({ accept_deadline: '2020-01-01T00:00:00.000Z' })} />)
  expect(screen.getByText('Applications and acceptance have closed for this gig.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Sign in to (apply|accept)/ })).not.toBeInTheDocument()
})

test('a session triggers the bearer refetch; the interim renders neither surface', async () => {
  authState.isAuthenticated = true
  authState.user = { id: STRANGER_ID }
  const { container } = render(<GigDetailApp initial={gigDetail()} />)
  await waitFor(() => expect(gigsState.fetchGigDetail).toHaveBeenCalledWith('escrow-1'))
  // Authed but the refetch hasn't landed — no "Sign in" flash.
  expect(container.textContent).not.toMatch(/Sign in/)
})

test('the refetched party-scoped gig swaps in the action surface', async () => {
  authState.isAuthenticated = true
  authState.user = { id: STRANGER_ID }
  gigsState.selectedGig = gigDetail()
  render(<GigDetailApp initial={gigDetail()} />)
  // An open gig offers a worker Accept — the authed CTA bar, not the link.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Accept Gig' })).toBeInTheDocument())
  expect(screen.queryByRole('link', { name: /Sign in/ })).not.toBeInTheDocument()
})

test('a stale slot for ANOTHER gig never renders against this one', () => {
  authState.isAuthenticated = true
  authState.user = { id: STRANGER_ID }
  gigsState.selectedGig = gigDetail({ escrow_id: 'some-other-gig' })
  const { container } = render(<GigDetailApp initial={gigDetail()} />)
  expect(container.textContent).not.toMatch(/Accept Gig/)
})

test('a gated CTA rides TxConfirmDialog; confirming fires the mapped hook action once', async () => {
  renderAsWorkerOnOpenGig()
  fireEvent.click(await screen.findByRole('button', { name: 'Accept Gig' }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Accept this gig?' })
  expect(actionsState.accept).not.toHaveBeenCalled() // the gate really gates
  fireEvent.click(within(dialog).getByRole('button', { name: 'Accept Gig' }))
  expect(actionsState.accept).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
})

test('cancelling the gate closes it without firing anything', async () => {
  renderAsWorkerOnOpenGig()
  fireEvent.click(await screen.findByRole('button', { name: 'Accept Gig' }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Accept this gig?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(actionsState.accept).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
})

test('a confirmed non-cancel tx toasts success and re-reads the detail', async () => {
  actionsState.pendingTxRef = 'sig-1'
  actionsState.pendingAction = 'accept'
  renderAsWorkerOnOpenGig()
  gigsState.fetchGigDetail.mockClear() // drop the mount refetch
  fireEvent.click(await screen.findByRole('button', { name: 'monitor-confirm' }))
  expect(actionsState.clearPending).toHaveBeenCalled()
  expect(toastMock).toHaveBeenCalledWith('success', expect.stringMatching(/./))
  expect(gigsState.fetchGigDetail).toHaveBeenCalledWith('escrow-1')
  expect(routerPush).not.toHaveBeenCalled()
})

test('a confirmed CANCEL leaves the dead gig page for /my-gigs instead of re-reading it', async () => {
  actionsState.pendingTxRef = 'sig-1'
  actionsState.pendingAction = 'cancel'
  renderAsWorkerOnOpenGig()
  gigsState.fetchGigDetail.mockClear()
  fireEvent.click(await screen.findByRole('button', { name: 'monitor-confirm' }))
  expect(routerPush).toHaveBeenCalledWith('/my-gigs')
  expect(gigsState.fetchGigDetail).not.toHaveBeenCalled()
})

test('a monitor failure clears the pending tx and reports it as still-syncing info', async () => {
  actionsState.pendingTxRef = 'sig-1'
  actionsState.pendingAction = 'accept'
  renderAsWorkerOnOpenGig()
  fireEvent.click(await screen.findByRole('button', { name: 'monitor-fail' }))
  expect(actionsState.clearPending).toHaveBeenCalled()
  expect(toastMock).toHaveBeenCalledWith('info', 'rpc gave up')
})

/**
 * The worker on a gig they have accepted — the seat that submits proof.
 * `counterparty` is what makes the CTA bar offer "Submit Proof".
 */
function renderAsWorkerOnAcceptedGig(proofs: GigDetail['proofs'] = []) {
  authState.isAuthenticated = true
  authState.user = { id: WORKER_ID }
  const accepted = gigDetail({
    status: 'accepted',
    counterparty: userRef(WORKER_ID),
    proof_requirements: ['image'],
    proofs,
  })
  gigsState.selectedGig = accepted
  return render(<GigDetailApp initial={accepted} />)
}

test('a FAILED proof submit re-reads the detail, so the retry knows what is stored', async () => {
  // The half-done state this fixes: the files uploaded, the transaction did
  // not. Without the re-read the dialog's `alreadyAttached` stayed empty in
  // exactly the situation it was written for, and the retry demanded the same
  // upload again.
  actionsState.submit.mockResolvedValue(false)
  renderAsWorkerOnAcceptedGig()
  gigsState.fetchGigDetail.mockClear() // drop the mount refetch

  fireEvent.click(await screen.findByRole('button', { name: 'Submit Proof' }))
  const input = await screen.findByLabelText('Choose proof files')
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

  await waitFor(() => expect(actionsState.submit).toHaveBeenCalled())
  await waitFor(() => expect(gigsState.fetchGigDetail).toHaveBeenCalledWith('escrow-1'))
})

test('a SUCCESSFUL submit does not re-read on the spot — the monitor owns that', async () => {
  // The negative half: a re-read here would fire mid-transaction, before the
  // escrow has moved, for every successful submit.
  actionsState.submit.mockResolvedValue(true)
  renderAsWorkerOnAcceptedGig()
  gigsState.fetchGigDetail.mockClear()

  fireEvent.click(await screen.findByRole('button', { name: 'Submit Proof' }))
  const input = await screen.findByLabelText('Choose proof files')
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

  await waitFor(() => expect(actionsState.submit).toHaveBeenCalled())
  expect(gigsState.fetchGigDetail).not.toHaveBeenCalled()
})

test('the retry submits on the STORED proofs alone, with no file re-picked', async () => {
  // End to end through the real dialog: what the server already holds is
  // enough, so the hook is called with an empty batch and reads the set back
  // itself.
  actionsState.submit.mockResolvedValue(true)
  renderAsWorkerOnAcceptedGig([
    { id: 'p1', escrow_id: 'escrow-1', url: 'https://cdn/a.jpg', payload: null, type: 'image', uploaded_at: new Date(0) },
  ])

  fireEvent.click(await screen.findByRole('button', { name: 'Submit Proof' }))
  expect(screen.getByText(/Already attached to this escrow: 1 proof \(photo\)/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(actionsState.submit).toHaveBeenCalledWith([]))
})

test('a monitor failure re-reads too — a broadcast submit can still fail on chain', async () => {
  actionsState.pendingTxRef = 'sig-1'
  actionsState.pendingAction = 'accept'
  renderAsWorkerOnOpenGig()
  gigsState.fetchGigDetail.mockClear()
  fireEvent.click(await screen.findByRole('button', { name: 'monitor-fail' }))
  expect(gigsState.fetchGigDetail).toHaveBeenCalledWith('escrow-1')
})

test('a takedown refusal (onStale) re-reads the detail so dead buttons disappear', async () => {
  renderAsWorkerOnOpenGig()
  gigsState.fetchGigDetail.mockClear()
  capturedActionsArgs.current?.onStale?.()
  expect(gigsState.fetchGigDetail).toHaveBeenCalledWith('escrow-1')
})
