/**
 * ExchangeDetailApp — the exchange hub over the gig-proven machinery:
 * the CTA rides the TxConfirmDialog gate before any hook action fires,
 * the monitor's confirm/fail exits route correctly (cancel leaves the
 * dead page), a takedown refusal re-reads, and the payout surfaces obey
 * the role gates (buyer instructions vs seller payout — never both).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

const { actionsState, capturedActionsArgs, capturedDialogArgs, capturedCheckApplied, toastMock, routerPush, liveRefreshMock } = vi.hoisted(() => ({
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
    publish: vi.fn(),
    submit: vi.fn(),
    addProofs: vi.fn(),
    dispute: vi.fn(),
  },
  capturedActionsArgs: { current: null as null | { onStale?: () => void } },
  // The dialogs and the monitor are mocked, so their callbacks are captured
  // rather than clicked — they are still THIS page's wiring, and the two below
  // are the only ways an added proof or a converged tx reaches the screen.
  capturedDialogArgs: {
    current: null as null | {
      onAddProofsReady?: (p: unknown[]) => Promise<void>
      onProofsReady?: (p: unknown[]) => Promise<boolean>
    },
  },
  capturedCheckApplied: { current: null as null | (() => Promise<boolean>) },
  toastMock: vi.fn(),
  routerPush: vi.fn(),
  liveRefreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => toastMock(...a) }))
vi.mock('@/components/escrow/TransactionMonitor', () => ({
  TransactionMonitor: ({
    onConfirmed,
    onFailed,
    checkApplied,
  }: {
    onConfirmed: () => void
    onFailed: (m: string) => void
    checkApplied: () => Promise<boolean>
  }) => {
    capturedCheckApplied.current = checkApplied
    return (
      <div>
        <button onClick={onConfirmed}>monitor-confirm</button>
        <button onClick={() => onFailed('rpc gave up')}>monitor-fail</button>
        <button onClick={() => onFailed('')}>monitor-empty-fail</button>
      </div>
    )
  },
}))
vi.mock('@/hooks/escrow/useEscrowActions', () => ({
  useEscrowActions: (args: { onStale?: () => void }) => {
    capturedActionsArgs.current = args
    return actionsState
  },
}))
vi.mock('@/hooks/escrow/useEscrowFee', () => ({
  useEscrowFee: () => ({ feeBps: 250, feePct: '2.50', feeRaw: BigInt(1250000), netRaw: BigInt(48750000) }),
}))
vi.mock('@/hooks/escrow/live', () => ({
  useEscrowLiveRefresh: (...a: unknown[]) => liveRefreshMock(...a),
}))
// The dialogs' internals are unit-tested with the gig hub; here they would
// only drag in upload plumbing.
vi.mock('@/components/gig/detail/action-dialogs', () => ({
  GigActionDialogs: (args: { onAddProofsReady?: (p: unknown[]) => Promise<void> }) => {
    capturedDialogArgs.current = args
    return null
  },
}))
vi.mock('@/api/client', () => ({
  api: {
    exchange: { get: vi.fn() },
    users: { standing: vi.fn(() => new Promise(() => {})) },
  },
}))

import { api } from '@/api/client'
import { ExchangeDetailApp } from '@/components/exchange/ExchangeDetailApp'
import { OFFER_ASIDE_COPY, OFFER_DETAIL_COPY } from '@/components/exchange/detail'
import { makeExchangeDetail, makePayoutAccount, makeUserRef } from '../../../test/factories/exchange'

const ACCOUNT = makePayoutAccount()

const refresh = vi.fn(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  actionsState.pendingTxRef = null
  actionsState.pendingAction = null
})

test('a stranger on an open offer: Accept gates behind the confirm dialog', async () => {
  render(<ExchangeDetailApp offer={makeExchangeDetail()} userId="stranger" refresh={refresh} />)
  fireEvent.click(screen.getByRole('button', { name: 'Accept Offer' }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Accept this offer?' })
  expect(actionsState.accept).not.toHaveBeenCalled() // the gate really gates
  fireEvent.click(within(dialog).getByRole('button', { name: 'Accept Offer' }))
  expect(actionsState.accept).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
})

test('a confirmed non-cancel tx toasts and re-reads; a confirmed CANCEL leaves for /exchange', () => {
  actionsState.pendingTxRef = 'sig-1'
  actionsState.pendingAction = 'accept'
  const { unmount } = render(
    <ExchangeDetailApp offer={makeExchangeDetail()} userId="stranger" refresh={refresh} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'monitor-confirm' }))
  expect(actionsState.clearPending).toHaveBeenCalled()
  expect(toastMock).toHaveBeenCalledWith('success', expect.stringMatching(/./))
  expect(refresh).toHaveBeenCalled()
  expect(routerPush).not.toHaveBeenCalled()
  unmount()

  refresh.mockClear()
  actionsState.pendingAction = 'cancel'
  render(<ExchangeDetailApp offer={makeExchangeDetail()} userId="seller-1" refresh={refresh} />)
  fireEvent.click(screen.getByRole('button', { name: 'monitor-confirm' }))
  expect(routerPush).toHaveBeenCalledWith('/exchange')
  expect(refresh).not.toHaveBeenCalled()
})

test('a monitor failure clears the pending tx and always says something', () => {
  actionsState.pendingTxRef = 'sig-1'
  actionsState.pendingAction = 'accept'
  render(<ExchangeDetailApp offer={makeExchangeDetail()} userId="stranger" refresh={refresh} />)

  fireEvent.click(screen.getByRole('button', { name: 'monitor-fail' }))
  expect(actionsState.clearPending).toHaveBeenCalled()
  expect(toastMock).toHaveBeenCalledWith('info', 'rpc gave up')

  // `onFailed` can hand back an empty string; an empty toast is a toast that
  // says the transaction vanished.
  fireEvent.click(screen.getByRole('button', { name: 'monitor-empty-fail' }))
  expect(toastMock).toHaveBeenCalledWith('info', expect.stringMatching(/will sync when confirmed/))
})

test('a takedown refusal (onStale) re-reads so dead buttons disappear', () => {
  render(<ExchangeDetailApp offer={makeExchangeDetail()} userId="stranger" refresh={refresh} />)
  refresh.mockClear()
  capturedActionsArgs.current?.onStale?.()
  expect(refresh).toHaveBeenCalled()
})

const ACCEPTED_TRADE = () =>
  makeExchangeDetail({
    status: 'accepted',
    payout_account: ACCOUNT,
    counterparty: makeUserRef({ id: 'buyer-1', first_name: 'Bola', last_name: 'Ade' }),
  })

test('the accepted BUYER sees instructions in ACTING order — terms, payment, then people (#48)', () => {
  // Never the seller's card. And the order is the acting order: the old one
  // put two people cards between the buyer and the account they were
  // mid-transfer to. FOLLOWING = the argument comes AFTER the receiver.
  render(<ExchangeDetailApp offer={ACCEPTED_TRADE()} userId="buyer-1" refresh={refresh} />)
  const follows = (a: Element, b: Element) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
  const payment = screen.getByText('Pay the seller')
  expect(screen.queryByText('Buyer pays into')).toBeNull()
  expect(follows(screen.getByRole('heading', { name: OFFER_DETAIL_COPY.terms }), payment)).toBeTruthy()
  expect(follows(payment, screen.getByRole('heading', { name: OFFER_DETAIL_COPY.trader }))).toBeTruthy()
})

test('the SELLER sees the bound account — never the buyer instructions', () => {
  render(<ExchangeDetailApp offer={ACCEPTED_TRADE()} userId="seller-1" refresh={refresh} />)
  expect(screen.getByText('Buyer pays into')).toBeInTheDocument()
  expect(screen.queryByText('Pay the seller')).toBeNull()
})

test('every block that speaks to a SEAT speaks to the reader’s own', () => {
  // Two blocks are perspective-aware — the aside's figures and the countdown's
  // label — and both were shipped buyer-only. One render, both questions: a
  // page that gets one right and the other wrong is the bug that was here.
  const accepted = makeExchangeDetail({
    status: 'accepted',
    completion_deadline: '2099-01-01T00:00:00.000Z',
    counterparty: makeUserRef({ id: 'buyer-1' }),
  })
  const panel = () => document.querySelector('[data-offer-countdown]')?.textContent ?? ''

  const asSeller = render(
    <ExchangeDetailApp offer={accepted} userId="seller-1" refresh={refresh} />,
  )
  expect(screen.getByText(OFFER_ASIDE_COPY.sellerPay)).toBeInTheDocument()
  expect(screen.queryByText(OFFER_DETAIL_COPY.youPay)).toBeNull()
  expect(panel()).toContain('The buyer pays within')
  expect(panel()).not.toContain('Miss this')
  asSeller.unmount()

  render(<ExchangeDetailApp offer={accepted} userId="buyer-1" refresh={refresh} />)
  expect(screen.getByText(OFFER_DETAIL_COPY.youPay)).toBeInTheDocument()
  expect(screen.queryByText(OFFER_ASIDE_COPY.sellerPay)).toBeNull()
  expect(panel()).toContain('Pay within')
  expect(panel()).toContain('Miss this')
})

test('the live-refresh subscription rides the offer identity', () => {
  render(<ExchangeDetailApp offer={makeExchangeDetail()} userId="stranger" refresh={refresh} />)
  expect(liveRefreshMock).toHaveBeenCalledWith('exch-1', refresh, 'open')
})

test('an added proof re-reads the offer only when the upload actually landed', async () => {
  // `addProofs` answers false on a refusal. Re-reading then would repaint the
  // page for nothing; NOT re-reading on success would leave the proof the
  // reader just uploaded off the screen until they reloaded.
  render(<ExchangeDetailApp offer={makeExchangeDetail()} userId="buyer-1" refresh={refresh} />)

  actionsState.addProofs.mockResolvedValueOnce(false)
  await capturedDialogArgs.current?.onAddProofsReady?.([])
  expect(refresh).not.toHaveBeenCalled()

  actionsState.addProofs.mockResolvedValueOnce(true)
  await capturedDialogArgs.current?.onAddProofsReady?.([])
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('a FAILED proof submit re-reads the offer, so the retry knows what is stored', async () => {
  // The half-done state: the receipt uploaded, the transaction did not. The
  // dialog's `alreadyAttached` comes off the offer, so without this re-read it
  // is empty in exactly the situation it exists for and the seller is asked to
  // upload the same file again.
  render(<ExchangeDetailApp offer={makeExchangeDetail()} userId="buyer-1" refresh={refresh} />)
  refresh.mockClear()

  actionsState.submit.mockResolvedValueOnce(false)
  expect(await capturedDialogArgs.current?.onProofsReady?.([])).toBe(false)
  expect(refresh).toHaveBeenCalledTimes(1)

  // …and NOT on success: the monitor owns the post-confirm re-read, and one
  // here would fire mid-transaction, before the escrow has moved.
  refresh.mockClear()
  actionsState.submit.mockResolvedValueOnce(true)
  expect(await capturedDialogArgs.current?.onProofsReady?.([])).toBe(true)
  expect(refresh).not.toHaveBeenCalled()
})

test('the monitor converges against THIS offer, not the escrow route', async () => {
  // The exchange detail endpoint is what carries the exchange's status; asking
  // the gig route would answer 404 and the monitor would never converge.
  const exchangeGet = vi.mocked(api.exchange.get)
  exchangeGet.mockResolvedValue(makeExchangeDetail({ status: 'accepted' }))
  actionsState.pendingAction = 'accept'
  render(<ExchangeDetailApp offer={makeExchangeDetail()} userId="stranger" refresh={refresh} />)

  await expect(capturedCheckApplied.current?.()).resolves.toBe(true)
  expect(exchangeGet).toHaveBeenCalledWith({ id: 'exch-1' })
})
