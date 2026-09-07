/**
 * The input dialogs: proof-upload gating over the REAL shared
 * missingProofTypes, the dispute reason gate + bond note, the review score
 * gate, the apply obligation, and the off-chain draft delete.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { APPLY_OBLIGATION, formatProofTypeList } from '@tenda/shared'

const { uploadProofsMock, toastMock, reviewMock, deleteMock, pushMock } = vi.hoisted(() => ({
  uploadProofsMock: vi.fn(),
  toastMock: vi.fn(),
  reviewMock: vi.fn(),
  deleteMock: vi.fn(),
  pushMock: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => toastMock(...a) }))
vi.mock('@/lib/uploads/escrow-proofs', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/uploads/escrow-proofs')),
  uploadProofs: (...a: unknown[]) => uploadProofsMock(...a),
}))
vi.mock('@/stores/gigs.store', () => ({
  useGigsStore: (selector: (s: { reviewEscrow: typeof reviewMock }) => unknown) =>
    selector({ reviewEscrow: reviewMock }),
}))
vi.mock('@/api/client', () => ({
  api: { escrows: { delete: (...a: unknown[]) => deleteMock(...a) } },
}))
// Mutable so the ApplyDialog tests can shape the trust list per case.
const authState = {
  wallets: [] as { chain_ns: string; address: string; is_primary: boolean; verified_at: string | null }[],
  walletsStatus: 'ready',
}
const ensureWalletsMock = vi.fn(async () => {})
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: typeof authState & { ensureWallets: () => Promise<void> }) => unknown) =>
    sel({ ...authState, ensureWallets: ensureWalletsMock }),
}))
// The row's own behaviour (bound preview, targeted connect) is covered in
// SigningWalletRow.test.tsx; here only the WIRING is under test — which
// dialogs mount it, on which chain, with which binding.
vi.mock('@/components/wallet/SigningWalletRow', () => ({
  SigningWalletRow: ({ chainId, bound }: { chainId: string; bound?: string | null }) => (
    <div data-testid="signer-row">
      {chainId}
      {bound !== undefined && bound !== null ? ` bound ${bound}` : ''}
    </div>
  ),
}))

import { ProofUploadDialog } from '@/components/gig/detail/ProofUploadDialog'
import { DisputeDialog, GigActionDialogs, ReviewDialog } from '@/components/gig/detail/action-dialogs'
import { ApplyDialog } from '@/components/gig/gig-applications'

function pickFile(name: string, type: string) {
  const input = screen.getByLabelText('Choose proof files')
  fireEvent.change(input, { target: { files: [new File(['x'], name, { type })] } })
}

beforeEach(() => {
  uploadProofsMock.mockResolvedValue([{ url: 'https://cdn/a.jpg', type: 'image' }])
  reviewMock.mockResolvedValue(undefined)
  deleteMock.mockResolvedValue({ deleted: true })
})

describe('ProofUploadDialog', () => {
  test('requirements gate the submit until every required type is covered', () => {
    const onSubmit = vi.fn()
    render(
      <ProofUploadDialog
        open
        onClose={vi.fn()}
        title="Submit proof"
        submitLabel="Submit"
        closeMode="before-submit"
        requirements={['image', 'video']}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getByText(/Still needed: photo and video/i)).toBeInTheDocument()
    pickFile('a.jpg', 'image/jpeg')
    expect(screen.getByText(/Still needed: video/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    pickFile('b.mp4', 'video/mp4')
    expect(screen.getByText(/All required proof attached/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
  })

  test('already-attached proofs count toward the requirement (retry after a failed tx)', () => {
    render(
      <ProofUploadDialog
        open
        onClose={vi.fn()}
        title="Submit proof"
        submitLabel="Submit"
        closeMode="before-submit"
        requirements={['image']}
        alreadyAttached={[{ type: 'image' }]}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByText(/All required proof attached/)).toBeInTheDocument()
  })

  test('RETRIES on the stored evidence alone — no file re-picked, nothing re-uploaded', async () => {
    // The whole point of the fix. The upload leg succeeded and the transaction
    // leg did not; demanding the same files again to retry the signature is
    // asking for the expensive half of a two-part action twice.
    const onSubmit = vi.fn(async () => true)
    render(
      <ProofUploadDialog
        open
        onClose={vi.fn()}
        title="Submit proof"
        submitLabel="Submit"
        closeMode="before-submit"
        requirements={['image']}
        alreadyAttached={[{ type: 'image' }]}
        onSubmit={onSubmit}
      />,
    )
    // Says what the escrow already holds, or the enabled button on an empty
    // form reads as a bug.
    expect(screen.getByText(/Already attached to this escrow: 1 proof \(photo\)/)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Submit' })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([]))
    // Nothing was re-uploaded: the caller re-reads the stored set itself.
    expect(uploadProofsMock).not.toHaveBeenCalled()
  })

  test('names a repeated proof type ONCE, and counts the rows', () => {
    // Three photos is an ordinary batch (the picker allows five), and the
    // per-ROW list printed "Photo, Photo, Photo" — on the retry screen this
    // whole change exists to serve.
    render(
      <ProofUploadDialog
        open
        onClose={vi.fn()}
        title="Submit proof"
        submitLabel="Submit"
        closeMode="before-submit"
        alreadyAttached={[{ type: 'image' }, { type: 'image' }, { type: 'image' }]}
        onSubmit={vi.fn()}
      />,
    )
    const note = screen.getByText(/Already attached/)
    expect(note.textContent).not.toMatch(/photo,\s*photo/i)
    // The row COUNT is what a worker checks against what they picked, and it
    // is the only number the type list cannot carry. "Proofs", not "files" —
    // a stored check-in or written answer was never a file.
    expect(note).toHaveTextContent('3 proofs')
    // Plural follows the rows, not the distinct types — one type, three rows.
    expect(note).toHaveTextContent(/reuses them/)
  })

  test('one stored proof reads in the singular', () => {
    render(
      <ProofUploadDialog
        open
        onClose={vi.fn()}
        title="Submit proof"
        submitLabel="Submit"
        closeMode="before-submit"
        alreadyAttached={[{ type: 'document' }]}
        onSubmit={vi.fn()}
      />,
    )
    const note = screen.getByText(/Already attached/)
    expect(note).toHaveTextContent('1 proof')
    expect(note).not.toHaveTextContent('1 proofs')
    expect(note).toHaveTextContent(/reuses it/)
  })

  test('words the requirement the way the SERVER and mobile word it', () => {
    // `formatProofTypeList` exists so the server's refusal, mobile's note and
    // this checklist read as one product voice — its own doc says so. The
    // dialog used to hand-roll a comma join, so a worker refused with
    // "requires photo and video proof" saw "Still missing: photo, video."
    render(
      <ProofUploadDialog
        open
        onClose={vi.fn()}
        title="Submit proof"
        submitLabel="Submit"
        closeMode="before-submit"
        requirements={['image', 'video']}
        onSubmit={vi.fn()}
      />,
    )
    // Asserted as WHOLE clauses, not as a bare `/photo and video/` match: both
    // halves of this paragraph name the same two types, so a substring search
    // passed while `required` was hand-rolled and only `stillNeeded` used the
    // shared formatter. (Caught by mutation — the first version of this test
    // survived replacing `formatProofTypeList` in `required`.)
    const note = screen.getByText(/Required proof/)
    const listed = formatProofTypeList(['image', 'video'])
    expect(note).toHaveTextContent(`Required proof: ${listed}.`)
    expect(note).toHaveTextContent(`Still needed: ${listed}.`)
    // The shared formatter joins the last pair with "and"; the comma join this
    // dialog used to carry is the drift being pinned.
    expect(listed).toBe('photo and video')
  })

  test('a retry still cannot skip a requirement the stored proofs do not cover', () => {
    // The dialog mirrors the server gate; it must not become a way round it
    // just because SOMETHING is attached. (The server re-checks regardless.)
    render(
      <ProofUploadDialog
        open
        onClose={vi.fn()}
        title="Submit proof"
        submitLabel="Submit"
        closeMode="before-submit"
        requirements={['image', 'video']}
        alreadyAttached={[{ type: 'image' }]}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByText(/Still needed: video/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  test('with NOTHING attached, an empty form is still refused — that is not a retry', () => {
    render(
      <ProofUploadDialog
        open
        onClose={vi.fn()}
        title="Add more proof"
        submitLabel="Upload"
        closeMode="before-submit"
        onSubmit={vi.fn()}
      />,
    )
    // "Add more proof" is handed no `alreadyAttached`, and uploading nothing
    // there would mean nothing at all.
    expect(screen.queryByText(/Already uploaded/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  })

  test('before-submit mode closes as soon as the upload lands, then hands off', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn(async () => true)
    render(
      <ProofUploadDialog
        open
        onClose={onClose}
        title="Submit proof"
        submitLabel="Submit"
        closeMode="before-submit"
        onSubmit={onSubmit}
      />,
    )
    pickFile('a.jpg', 'image/jpeg')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([{ url: 'https://cdn/a.jpg', type: 'image' }]))
    expect(onClose).toHaveBeenCalled()
  })

  test('a chainId mounts the signer preview with the escrow binding (on-chain submit)', () => {
    render(
      <ProofUploadDialog
        open
        onClose={vi.fn()}
        title="Submit proof"
        submitLabel="Submit"
        closeMode="before-submit"
        chainId="solana:devnet"
        boundSigner="Worker11Wallet"
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByTestId('signer-row')).toHaveTextContent('solana:devnet bound Worker11Wallet')
  })

  test('without a chainId no wallet is previewed (the off-chain add-more path)', () => {
    render(
      <ProofUploadDialog
        open
        onClose={vi.fn()}
        title="Add more proof"
        submitLabel="Upload"
        closeMode="before-submit"
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('signer-row')).toBeNull()
  })

  test('a failed upload keeps the dialog open and never hands off', async () => {
    uploadProofsMock.mockResolvedValue(null) // failure already toasted inside
    const onClose = vi.fn()
    const onSubmit = vi.fn()
    render(
      <ProofUploadDialog
        open
        onClose={onClose}
        title="Submit proof"
        submitLabel="Submit"
        closeMode="before-submit"
        onSubmit={onSubmit}
      />,
    )
    pickFile('a.jpg', 'image/jpeg')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(uploadProofsMock).toHaveBeenCalled())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('DisputeDialog', () => {
  test('gates on a non-empty reason and names the bond', async () => {
    const onDisputeReady = vi.fn(async () => true)
    render(<DisputeDialog open onClose={vi.fn()} bondLabel="5 USDC" onDisputeReady={onDisputeReady} />)
    expect(screen.getByText(/5 USDC bond is locked/)).toBeInTheDocument()
    const raise = screen.getByRole('button', { name: 'Raise Dispute' })
    expect(raise).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/Describe the issue/), { target: { value: '  late  ' } })
    fireEvent.click(raise)
    await waitFor(() => expect(onDisputeReady).toHaveBeenCalledWith('late'))
  })

  test('without a bond the note still promises the wallet, not a charge', () => {
    render(<DisputeDialog open onClose={vi.fn()} onDisputeReady={vi.fn()} />)
    expect(screen.getByText(/wallet will open to approve/)).toBeInTheDocument()
    expect(screen.queryByText(/bond/)).not.toBeInTheDocument()
  })

  test('a chainId mounts the signer preview with the escrow binding', () => {
    render(
      <DisputeDialog
        open
        onClose={vi.fn()}
        chainId="eip155:84532"
        boundSigner="0xBoundWallet"
        onDisputeReady={vi.fn()}
      />,
    )
    expect(screen.getByTestId('signer-row')).toHaveTextContent('eip155:84532 bound 0xBoundWallet')
  })
})

describe('ReviewDialog', () => {
  test('gates on a score, submits through the store, toasts and notifies', async () => {
    const onReviewSubmitted = vi.fn()
    render(
      <ReviewDialog open onClose={vi.fn()} escrowId="e1" onReviewSubmitted={onReviewSubmitted} />,
    )
    const submit = screen.getByRole('button', { name: 'Submit Review' })
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }))
    fireEvent.change(screen.getByPlaceholderText(/Share your experience/), { target: { value: 'great' } })
    fireEvent.click(submit)
    await waitFor(() => expect(reviewMock).toHaveBeenCalledWith('e1', { score: 4, comment: 'great' }))
    expect(onReviewSubmitted).toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith('success', 'Review submitted!')
  })
})

describe('ApplyDialog', () => {
  const SOL_PRIMARY = { chain_ns: 'solana', address: 'So1Primary11111', is_primary: true, verified_at: '2026-01-01' }
  const SOL_SECOND = { chain_ns: 'solana', address: 'So1Second111111', is_primary: false, verified_at: '2026-01-01' }
  const EVM_WALLET = { chain_ns: 'eip155', address: '0xEvmWallet', is_primary: false, verified_at: '2026-01-01' }

  beforeEach(() => {
    authState.wallets = [SOL_PRIMARY, SOL_SECOND, EVM_WALLET]
    authState.walletsStatus = 'ready'
  })

  test('states the obligation, trims the pitch to null, submits the PRIMARY by default', async () => {
    const onSubmit = vi.fn(async () => true)
    const onClose = vi.fn()
    render(
      <ApplyDialog open busy={false} chainId="solana:devnet" onClose={onClose} onSubmit={onSubmit} />,
    )
    expect(screen.getByText(APPLY_OBLIGATION)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/good fit/), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(null, SOL_PRIMARY.address))
    expect(onClose).toHaveBeenCalled()
  })

  test('offers ONLY wallets on the gig chain namespace — the EVM wallet never appears', () => {
    render(
      <ApplyDialog open busy={false} chainId="solana:devnet" onClose={vi.fn()} onSubmit={vi.fn()} />,
    )
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.queryByText(/0xEvm/)).toBeNull()
  })

  test('picking another wallet submits THAT wallet', async () => {
    const onSubmit = vi.fn(async () => true)
    render(
      <ApplyDialog open busy={false} chainId="solana:devnet" onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    fireEvent.click(screen.getByRole('radio', { name: /So1S/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(null, SOL_SECOND.address))
  })

  test('a re-apply starts on the previously recorded wallet, not the primary', () => {
    render(
      <ApplyDialog
        open
        busy={false}
        chainId="solana:devnet"
        initialWallet={SOL_SECOND.address}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByRole('radio', { name: /So1S/ })).toHaveAttribute('aria-checked', 'true')
  })

  test('no wallet on the gig chain: names the chain, routes to link-wallet, cannot submit', () => {
    authState.wallets = [EVM_WALLET]
    const onSubmit = vi.fn()
    render(
      <ApplyDialog open busy={false} chainId="solana:devnet" onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    expect(screen.getByText(/Link a wallet on that chain to apply/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Link a wallet' })).toHaveAttribute(
      'href',
      '/settings/linked-wallets',
    )
    const submit = screen.getByRole('button', { name: 'Send application' })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('stays open when the application is refused', async () => {
    const onSubmit = vi.fn(async () => false)
    const onClose = vi.fn()
    render(
      <ApplyDialog open busy={false} chainId="solana:devnet" onClose={onClose} onSubmit={onSubmit} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })

  test('while the trust list loads, it says so — never "link a wallet"', () => {
    authState.walletsStatus = 'loading'
    authState.wallets = []
    render(
      <ApplyDialog open busy={false} chainId="solana:devnet" onClose={vi.fn()} onSubmit={vi.fn()} />,
    )
    expect(screen.getByText('Loading your wallets…')).toBeInTheDocument()
    // The not-loaded and none-linked states must never be conflated.
    expect(screen.queryByText(/Link a wallet on that chain/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Send application' })).toBeDisabled()
  })

  test('a FAILED trust-list load says so and offers a retry, not a wordless dead-end', () => {
    authState.walletsStatus = 'error'
    authState.wallets = []
    render(
      <ApplyDialog open busy={false} chainId="solana:devnet" onClose={vi.fn()} onSubmit={vi.fn()} />,
    )
    expect(screen.getByText(/Could not load your linked wallets/)).toBeInTheDocument()
    expect(screen.queryByText(/Link a wallet on that chain/)).toBeNull()
    ensureWalletsMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(ensureWalletsMock).toHaveBeenCalled()
  })
})

const GIG = {
  escrow_id: 'e1',
  dispute_bond_raw: '0',
  asset: 'USDC_SOL',
  chain_id: 'solana:devnet',
  my_signer_address: 'Worker11Wallet',
}

describe('GigActionDialogs — signer wiring', () => {
  function renderSheet(activeSheet: 'proof' | 'addProof' | 'dispute') {
    render(
      <GigActionDialogs
        gig={GIG}
        activeSheet={activeSheet}
        onClose={vi.fn()}
        onReviewSubmitted={vi.fn()}
        onProofsReady={vi.fn()}
        onAddProofsReady={vi.fn()}
        onDisputeReady={vi.fn()}
      />,
    )
  }

  test('submit-proof previews the escrow-bound signing wallet', () => {
    renderSheet('proof')
    expect(screen.getByTestId('signer-row')).toHaveTextContent('solana:devnet bound Worker11Wallet')
  })

  test('dispute previews the escrow-bound signing wallet', () => {
    renderSheet('dispute')
    expect(screen.getByTestId('signer-row')).toHaveTextContent('solana:devnet bound Worker11Wallet')
  })

  test('add-more-proof is off-chain and promises no wallet', () => {
    renderSheet('addProof')
    expect(screen.queryByTestId('signer-row')).toBeNull()
  })
})

describe('GigActionDialogs — delete draft', () => {
  test('the confirm deletes off-chain and lands on My Gigs', async () => {
    render(
      <GigActionDialogs
        gig={GIG}
        activeSheet="delete"
        onClose={vi.fn()}
        onReviewSubmitted={vi.fn()}
        onProofsReady={vi.fn()}
        onAddProofsReady={vi.fn()}
        onDisputeReady={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith({ id: 'e1' }))
    expect(toastMock).toHaveBeenCalledWith('success', 'Draft deleted')
    expect(pushMock).toHaveBeenCalledWith('/my-gigs')
  })

  test('cancel never deletes', () => {
    const onClose = vi.fn()
    render(
      <GigActionDialogs
        gig={GIG}
        activeSheet="delete"
        onClose={onClose}
        onReviewSubmitted={vi.fn()}
        onProofsReady={vi.fn()}
        onAddProofsReady={vi.fn()}
        onDisputeReady={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(deleteMock).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
