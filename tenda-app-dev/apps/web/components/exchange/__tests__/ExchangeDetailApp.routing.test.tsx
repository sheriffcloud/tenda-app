/**
 * Where the offer page's confirm gate SENDS each move.
 *
 * `runConfirmedAction` is a switch from the pending `EscrowTxType` to one hook
 * call, and every arm settles differently: approve releases the crypto to the
 * buyer, cancel refunds it to the seller, claim takes it out of a stalled
 * escrow. A swapped arm leaves every label on the page correct and settles the
 * wrong way — which is why each arm is driven end to end here rather than
 * asserted as a mapping.
 *
 * Its own file beside the hub's behaviours: one page, two questions.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { txConfirmCopy, type EscrowTxType } from '@tenda/shared'

const { actionsState } = vi.hoisted(() => ({
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
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: vi.fn() }))
vi.mock('@/components/escrow/TransactionMonitor', () => ({ TransactionMonitor: () => null }))
vi.mock('@/components/gig/detail/action-dialogs', () => ({ GigActionDialogs: () => null }))
vi.mock('@/hooks/escrow/useEscrowActions', () => ({ useEscrowActions: () => actionsState }))
vi.mock('@/hooks/escrow/useEscrowFee', () => ({
  useEscrowFee: () => ({ feeBps: 250, feePct: '2.50', feeRaw: BigInt(1250000), netRaw: BigInt(48750000) }),
}))
vi.mock('@/hooks/escrow/live', () => ({ useEscrowLiveRefresh: () => undefined }))
vi.mock('@/api/client', () => ({
  api: { exchange: { get: vi.fn() }, users: { standing: vi.fn(() => new Promise(() => {})) } },
}))

import { ExchangeDetailApp } from '@/components/exchange/ExchangeDetailApp'
import { makeExchangeDetail, makeUserRef } from '../../../test/factories/exchange'

const refresh = vi.fn(async () => {})

/** Every hook action the confirm gate can reach — the "nothing else" half. */
const TX_ACTIONS = ['accept', 'decline', 'approve', 'claim', 'cancel', 'publish'] as const

beforeEach(() => {
  vi.clearAllMocks()
})

const ROUTES: { action: EscrowTxType; cta: string; offer: Parameters<typeof makeExchangeDetail>[0]; userId: string; calls: keyof typeof actionsState }[] = [
  { action: 'accept', cta: 'Accept Offer', offer: {}, userId: 'stranger', calls: 'accept' },
  { action: 'cancel', cta: 'Cancel Offer', offer: {}, userId: 'seller-1', calls: 'cancel' },
  { action: 'create', cta: 'Publish Offer', offer: { status: 'draft' }, userId: 'seller-1', calls: 'publish' },
  {
    action: 'decline',
    cta: 'Decline',
    offer: { is_assigned: true, assigned_counterparty_id: 'buyer-1' },
    userId: 'buyer-1',
    calls: 'decline',
  },
  {
    action: 'approve',
    cta: 'Confirm & Release',
    offer: { status: 'submitted', counterparty: makeUserRef({ id: 'buyer-1' }) },
    userId: 'seller-1',
    calls: 'approve',
  },
  {
    action: 'claim_stalled',
    cta: 'Claim Crypto',
    offer: {
      status: 'submitted',
      counterparty: makeUserRef({ id: 'buyer-1' }),
      approval_deadline: new Date('2020-01-01T00:00:00.000Z').toISOString(),
    },
    userId: 'buyer-1',
    calls: 'claim',
  },
]

test.each(ROUTES)('confirming $action calls $calls and nothing else', async ({ action, cta, offer, userId, calls }) => {
  const view = render(
    <ExchangeDetailApp offer={makeExchangeDetail(offer)} userId={userId} refresh={refresh} />,
  )
  fireEvent.click(screen.getByRole('button', { name: cta }))

  // The gate's own copy names the confirm button, so this cannot drift from
  // the shared table it is generated from.
  const copy = txConfirmCopy(action, { amount: '50 USDC', kind: 'exchange', netAmount: null, feePct: null })
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name: copy?.confirmLabel }))

  const fired = TX_ACTIONS.filter((name) => actionsState[name].mock.calls.length > 0)
  expect(fired).toEqual([calls])
  view.unmount()
})
