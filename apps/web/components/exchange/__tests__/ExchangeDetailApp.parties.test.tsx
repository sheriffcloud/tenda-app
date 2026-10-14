/**
 * What the offer page renders FOR WHOM: the party-scoped half (counterparty
 * card, proofs, dispute) is drawn from what the server sent — never
 * synthesised for an outsider, and the dispute banner obeys the escrow's
 * status, not the row's mere presence.
 *
 * Its own file beside the hub's behaviours and the confirm-gate switch (the
 * routing suite): one page, three questions.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { PROOF_TYPE_LABEL } from '@tenda/shared'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: vi.fn() }))
vi.mock('@/components/escrow/TransactionMonitor', () => ({ TransactionMonitor: () => null }))
vi.mock('@/components/gig/detail/action-dialogs', () => ({ GigActionDialogs: () => null }))
vi.mock('@/hooks/escrow/useEscrowActions', () => ({
  useEscrowActions: () => ({
    busyAction: null,
    pendingTxRef: null,
    pendingAction: null,
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
  }),
}))
vi.mock('@/hooks/escrow/useEscrowFee', () => ({
  useEscrowFee: () => ({ feeBps: 250, feePct: '2.50', feeRaw: BigInt(1250000), netRaw: BigInt(48750000) }),
}))
vi.mock('@/hooks/escrow/live', () => ({ useEscrowLiveRefresh: () => undefined }))
vi.mock('@/api/client', () => ({
  api: { exchange: { get: vi.fn() }, users: { standing: vi.fn(() => new Promise(() => {})) } },
}))

import { ExchangeDetailApp } from '@/components/exchange/ExchangeDetailApp'
import { DISPUTE_NOTICE_COPY } from '@/components/escrow/DisputeNotice'
import { OFFER_DETAIL_COPY } from '@/components/exchange/detail'
import { disputeRow } from '../../../test/factories/escrow'
import { makeExchangeDetail, makeUserRef } from '../../../test/factories/exchange'

const refresh = vi.fn(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
})

test('the party half is rendered from what the SERVER sent, never synthesised', () => {
  // An outsider's wire has counterparty null, proofs [], dispute null — the
  // page must draw none of those blocks rather than empty shells that reveal
  // the shape of what is being withheld.
  const outsider = render(
    <ExchangeDetailApp offer={makeExchangeDetail()} userId="stranger" refresh={refresh} />,
  )
  expect(screen.queryByText(OFFER_DETAIL_COPY.proofs)).toBeNull()
  expect(screen.queryByText('Buyer')).toBeNull()
  outsider.unmount()

  render(
    <ExchangeDetailApp
      offer={makeExchangeDetail({
        status: 'disputed',
        counterparty: makeUserRef({ id: 'buyer-1', first_name: 'Bola', last_name: 'Ade' }),
        proofs: [
          {
            id: 'proof-1',
            escrow_id: 'exch-1',
            payload: null,
            // A REAL proof type from `PROOF_TYPES`,
            // so the row this asserts on is one the server can actually send.
            type: 'image',
            url: 'https://cdn.test/receipt.png',
            uploaded_at: new Date('2026-08-16T10:00:00.000Z'),
          },
        ],
        // The REAL `Dispute` row (it has no status column): the ESCROW's own
        // status is what says the trade is in dispute, and that is exactly
        // what the page gates the block on.
        dispute: disputeRow({
          id: 'dsp-1',
          escrow_id: 'exch-1',
          raised_by: 'buyer-1',
          reason: 'Payment sent, not released',
          created_at: new Date('2026-08-16T10:00:00.000Z'),
        }),
      })}
      userId="buyer-1"
      refresh={refresh}
    />,
  )
  expect(screen.getByText(OFFER_DETAIL_COPY.proofs)).toBeInTheDocument()
  // The proof is OPENABLE, and named by the SHARED label through the same
  // DossierProofList the gig surfaces render (#48) — the raw "image proof"
  // enum text is gone here too.
  expect(screen.getByRole('link', { name: PROOF_TYPE_LABEL.image })).toHaveAttribute(
    'href',
    'https://cdn.test/receipt.png',
  )
  expect(screen.getByText('Buyer')).toBeInTheDocument()
  expect(screen.getByText('Payment sent, not released')).toBeInTheDocument()
})

test('a RESOLVED trade drops the dispute banner even though the row still arrives', () => {
  // Resolution stamps winner/resolved_at on the dispute row, it never deletes
  // it — the status half of the gate is what keeps a settled trade from
  // shouting "Dispute raised" (mobile's rule, and the gig surfaces').
  render(
    <ExchangeDetailApp
      offer={makeExchangeDetail({
        status: 'resolved',
        counterparty: makeUserRef({ id: 'buyer-1' }),
        dispute: disputeRow({
          escrow_id: 'exch-1',
          raised_by: 'buyer-1',
          winner: 'creator',
          resolved_by: 'admin-1',
          resolved_at: new Date('2026-08-17T00:00:00.000Z'),
        }),
      })}
      userId="buyer-1"
      refresh={refresh}
    />,
  )
  expect(screen.queryByText(DISPUTE_NOTICE_COPY.title)).toBeNull()
  expect(screen.queryByRole('link', { name: DISPUTE_NOTICE_COPY.openThread })).toBeNull()
})
