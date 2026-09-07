/**
 * ExchangeCTA — the buyer (counterparty) must keep an add-evidence affordance
 * while a dispute is open (the bug: it fell through to null, mirroring the gig
 * path's earlier fix). canAddProof = counterparty + submitted|disputed, so the
 * same branch also covers add-more-proof while the seller reviews.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { ExchangeDetail } from '@tenda/shared'
import {
  BUYER_ID,
  SELLER_ID,
  STRANGER_ID,
  exchangeDetail,
  matchedOffer,
} from '../__fixtures__/exchange-detail'

jest.mock('@/components/ui/Button', () => {
  const { Text } = require('react-native')
  return {
    Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <Text onPress={onPress}>{children}</Text>
    ),
  }
})

import { ExchangeCTA } from '../ExchangeCTA'

const noop = () => {}
const baseProps = { busy: false, onTxAction: noop }

test('disputed buyer gets an "Add Evidence" button that opens the add-proof sheet', () => {
  const onSheet = jest.fn()
  render(<ExchangeCTA offer={matchedOffer('disputed')} userId={BUYER_ID} onSheet={onSheet} {...baseProps} />)

  const btn = screen.getByText('Add Evidence')
  fireEvent.press(btn)
  expect(onSheet).toHaveBeenCalledWith('addProof')
})

test('submitted buyer gets "Add More Proof" (same branch, non-dispute wording)', () => {
  const onSheet = jest.fn()
  render(<ExchangeCTA offer={matchedOffer('submitted')} userId={BUYER_ID} onSheet={onSheet} {...baseProps} />)

  fireEvent.press(screen.getByText('Add More Proof'))
  expect(onSheet).toHaveBeenCalledWith('addProof')
})

test('submitted buyer ALSO gets a Dispute button (symmetry with the gig worker)', () => {
  const onSheet = jest.fn()
  render(<ExchangeCTA offer={matchedOffer('submitted')} userId={BUYER_ID} onSheet={onSheet} {...baseProps} />)

  // Both affordances: add more evidence AND escalate a stalling seller.
  expect(screen.getByText('Add More Proof')).toBeTruthy()
  fireEvent.press(screen.getByText('Dispute'))
  expect(onSheet).toHaveBeenCalledWith('dispute')
})

test('disputed buyer sees Add Evidence but NOT a redundant Dispute button', () => {
  render(<ExchangeCTA offer={matchedOffer('disputed')} userId={BUYER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Add Evidence')).toBeTruthy()
  expect(screen.queryByText('Dispute')).toBeNull()
})

test('disputed seller (creator) sees no evidence button — evidence is the counterparty’s', () => {
  render(<ExchangeCTA offer={matchedOffer('disputed')} userId={SELLER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.queryByText('Add Evidence')).toBeNull()
  expect(screen.queryByText('Add More Proof')).toBeNull()
})

test('submitted seller still gets Confirm & Release (branch not shadowed by canAddProof)', () => {
  render(<ExchangeCTA offer={matchedOffer('submitted')} userId={SELLER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Confirm & Release')).toBeTruthy()
})

test('submitted buyer past the approval deadline gets Claim Crypto, NOT the proof button', () => {
  // Regression: canAddProof and canClaim are BOTH true here; claiming must win
  // so the buyer can still recover their crypto when the seller stalls.
  const stalled: ExchangeDetail = {
    ...matchedOffer('submitted'),
    approval_deadline: new Date(Date.now() - 60_000).toISOString(),
  }
  render(<ExchangeCTA offer={stalled} userId={BUYER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Claim Crypto')).toBeTruthy()
  expect(screen.queryByText('Add More Proof')).toBeNull()
})

// ── acceptance mode: read from the offer, never assumed ──────────────────
//
// The CTA used to spread UNRESTRICTED_ACCEPTANCE, so every one of these
// rendered Accept Offer. `assigned_counterparty_id` carries no kind restriction
// at create, so an invite-only offer is a state the server really produces.

test('an unrestricted open offer still offers Accept to any non-creator', () => {
  const open = exchangeDetail({ status: 'open' })
  render(<ExchangeCTA offer={open} userId={BUYER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Accept Offer')).toBeTruthy()
})

test('invite-only offer: a stranger gets NO Accept button (the server would 403)', () => {
  // What an outsider actually receives: the flag set, the id withheld. Judging
  // off the id alone would read this as unassigned and offer the button.
  const invited = exchangeDetail({
    status: 'open',
    is_assigned: true,
    assigned_counterparty_id: null,
  })
  render(<ExchangeCTA offer={invited} userId={STRANGER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.queryByText('Accept Offer')).toBeNull()
})

test('invite-only offer: the INVITEE gets Accept (they are a party, so they get the id)', () => {
  const invited = exchangeDetail({ status: 'open', assigned_counterparty_id: BUYER_ID })
  render(<ExchangeCTA offer={invited} userId={BUYER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Accept Offer')).toBeTruthy()
})

test('approval-mode offer closes Accept — the field is live, not a hardcoded false', () => {
  // Exchange create rejects `requires_approval` TODAY. The CTA reads the column
  // rather than assuming it, so opening approval mode to exchanges needs no
  // client edit — this test is what holds that open.
  const approval = exchangeDetail({ status: 'open', requires_approval: true })
  render(<ExchangeCTA offer={approval} userId={BUYER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.queryByText('Accept Offer')).toBeNull()
})

// ── taken down (CO1) ────────────────────────────────────────────────────────
//
// A hidden offer stays readable and operable for its parties — the server
// refuses only the ways IN. The seller's money is in escrow, so every exit has
// to survive; only Accept and Publish go.

test('taken down: no Accept, however open the offer looks', () => {
  const open = exchangeDetail()
  render(<ExchangeCTA offer={open} userId={BUYER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Accept Offer')).toBeTruthy()
  screen.unmount()

  render(<ExchangeCTA offer={{ ...open, hidden: true }} userId={BUYER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.queryByText('Accept Offer')).toBeNull()
})

test('taken down: the seller keeps Cancel on an open offer', () => {
  const offer: ExchangeDetail = { ...exchangeDetail(), hidden: true }
  render(<ExchangeCTA offer={offer} userId={SELLER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Cancel Offer')).toBeTruthy()
})

test('taken down draft: Delete Draft stays, Publish Offer goes', () => {
  // Publishing would fund an escrow nobody may accept — the server refuses it,
  // so offering the button would only cost the seller a wallet round-trip.
  const draft: ExchangeDetail = { ...exchangeDetail({ status: 'draft' }), hidden: true }
  render(<ExchangeCTA offer={draft} userId={SELLER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Delete Draft')).toBeTruthy()
  expect(screen.queryByText('Publish Offer')).toBeNull()
})

test('a VISIBLE draft still offers both', () => {
  const draft = exchangeDetail({ status: 'draft' })
  render(<ExchangeCTA offer={draft} userId={SELLER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Delete Draft')).toBeTruthy()
  expect(screen.getByText('Publish Offer')).toBeTruthy()
})

test('taken down: the settlement path is untouched', () => {
  // Mark as Paid, Confirm & Release, Dispute — the moves that get the money out.
  render(
    <ExchangeCTA offer={{ ...matchedOffer('accepted'), hidden: true }} userId={BUYER_ID} onSheet={noop} {...baseProps} />,
  )
  expect(screen.getByText('Mark as Paid')).toBeTruthy()
  screen.unmount()

  render(
    <ExchangeCTA offer={{ ...matchedOffer('submitted'), hidden: true }} userId={SELLER_ID} onSheet={noop} {...baseProps} />,
  )
  expect(screen.getByText('Confirm & Release')).toBeTruthy()
  expect(screen.getByText('Dispute')).toBeTruthy()
})

test('taken down: a stranger sees nothing rather than an error', () => {
  const offer: ExchangeDetail = { ...exchangeDetail(), hidden: true }
  const { toJSON } = render(
    <ExchangeCTA offer={offer} userId={STRANGER_ID} onSheet={noop} {...baseProps} />,
  )
  expect(toJSON()).toBeNull()
})

// ── which button fires which action ─────────────────────────────────────────
//
// The mapping was never asserted: the tests above prove the right BUTTON shows,
// not that pressing it does the right thing. A swapped pair here (approve vs
// claim, cancel vs create) is a wallet opening on the wrong transaction, and
// nothing else in the suite would notice.

test.each([
  { label: 'Publish Offer', offer: exchangeDetail({ status: 'draft' }), viewer: SELLER_ID, action: 'create' },
  { label: 'Accept Offer', offer: exchangeDetail(), viewer: BUYER_ID, action: 'accept' },
  { label: 'Cancel Offer', offer: exchangeDetail(), viewer: SELLER_ID, action: 'cancel' },
  { label: 'Confirm & Release', offer: matchedOffer('submitted'), viewer: SELLER_ID, action: 'approve' },
])('$label fires $action', ({ label, offer, viewer, action }) => {
  const onTxAction = jest.fn()
  render(<ExchangeCTA offer={offer} userId={viewer} onSheet={noop} busy={false} onTxAction={onTxAction} />)
  fireEvent.press(screen.getByText(label))
  expect(onTxAction).toHaveBeenCalledWith(action)
})

test('Claim Crypto fires claim_stalled once the approval deadline has passed', () => {
  const stalled: ExchangeDetail = {
    ...matchedOffer('submitted'),
    approval_deadline: new Date(Date.now() - 60_000).toISOString(),
  }
  const onTxAction = jest.fn()
  render(<ExchangeCTA offer={stalled} userId={BUYER_ID} onSheet={noop} busy={false} onTxAction={onTxAction} />)
  fireEvent.press(screen.getByText('Claim Crypto'))
  expect(onTxAction).toHaveBeenCalledWith('claim_stalled')
})

test.each([
  { label: 'Delete Draft', offer: exchangeDetail({ status: 'draft' }), viewer: SELLER_ID, sheet: 'delete' },
  { label: 'Mark as Paid', offer: matchedOffer('accepted'), viewer: BUYER_ID, sheet: 'proof' },
  { label: 'Dispute', offer: matchedOffer('submitted'), viewer: SELLER_ID, sheet: 'dispute' },
  { label: 'Add Evidence', offer: matchedOffer('disputed'), viewer: BUYER_ID, sheet: 'addProof' },
  // The seller disputing an ACCEPTED offer: canAddProof is buyer-only, so this
  // is the standalone Dispute branch rather than the paired one above.
  { label: 'Dispute', offer: matchedOffer('accepted'), viewer: SELLER_ID, sheet: 'dispute' },
])('$label opens the $sheet sheet', ({ label, offer, viewer, sheet }) => {
  // Sheets, not transactions — no wallet opens, so these must NOT route
  // through onTxAction.
  const onSheet = jest.fn()
  const onTxAction = jest.fn()
  render(<ExchangeCTA offer={offer} userId={viewer} onSheet={onSheet} busy={false} onTxAction={onTxAction} />)
  fireEvent.press(screen.getByText(label))
  expect(onSheet).toHaveBeenCalledWith(sheet)
  expect(onTxAction).not.toHaveBeenCalled()
})

test('Leave Review opens the review sheet once settled', () => {
  const done = matchedOffer('completed')
  const onSheet = jest.fn()
  render(<ExchangeCTA offer={done} userId={SELLER_ID} onSheet={onSheet} {...baseProps} />)
  fireEvent.press(screen.getByText('Leave Review'))
  expect(onSheet).toHaveBeenCalledWith('review')
})

// ── direct invite: Accept and Decline ───────────────────────────────────────
//
// A direct offer names its buyer. Declining it is a real transition the state
// machine has always allowed, and this bar had no button for it — the only way
// out of an unwanted invitation was to ignore it until it expired.
//
// The pairing is asked as two separate questions rather than one nested pair,
// and a takedown is what makes that load-bearing: `canAccept` refuses a pulled
// listing while `canDecline` does not, so nesting would take the invitee's ONLY
// button away at the exact moment they most need it.

/** An offer inviting BUYER_ID specifically. */
const invited = (over: Partial<ExchangeDetail> = {}): ExchangeDetail =>
  exchangeDetail({ assigned_counterparty_id: BUYER_ID, ...over })

test('an invited buyer gets both Accept and Decline', () => {
  render(<ExchangeCTA offer={invited()} userId={BUYER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Accept Offer')).toBeTruthy()
  expect(screen.getByText('Decline')).toBeTruthy()
})

test('taken down: the invitee KEEPS Decline and loses only Accept', () => {
  // The regression this pairing exists for. Their money is not at stake, but
  // their answer is: an invitation pulled from under someone must still be
  // answerable, or it sits open on their screen with no way to clear it.
  render(
    <ExchangeCTA offer={invited({ hidden: true })} userId={BUYER_ID} onSheet={noop} {...baseProps} />,
  )
  expect(screen.queryByText('Accept Offer')).toBeNull()
  expect(screen.getByText('Decline')).toBeTruthy()
})

test('Decline fires the decline transition, not a sheet', () => {
  // It opens a wallet (the state machine moves the escrow), so it must route
  // through onTxAction like accept — a sheet here would promise no wallet.
  const onTxAction = jest.fn()
  const onSheet = jest.fn()
  render(
    <ExchangeCTA offer={invited()} userId={BUYER_ID} onSheet={onSheet} busy={false} onTxAction={onTxAction} />,
  )
  fireEvent.press(screen.getByText('Decline'))
  expect(onTxAction).toHaveBeenCalledWith('decline')
  expect(onSheet).not.toHaveBeenCalled()
})

test('an OPEN offer offers no Decline — there is no invitation to refuse', () => {
  render(<ExchangeCTA offer={exchangeDetail()} userId={BUYER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.getByText('Accept Offer')).toBeTruthy()
  expect(screen.queryByText('Decline')).toBeNull()
})

test('someone else’s invitation shows a stranger nothing', () => {
  // Both halves must refuse them: Accept because they are not the invitee,
  // Decline because it is not theirs to answer.
  const { toJSON } = render(
    <ExchangeCTA offer={invited()} userId={STRANGER_ID} onSheet={noop} {...baseProps} />,
  )
  expect(toJSON()).toBeNull()
})

test('the seller never sees Decline on their own invitation', () => {
  render(<ExchangeCTA offer={invited()} userId={SELLER_ID} onSheet={noop} {...baseProps} />)
  expect(screen.queryByText('Decline')).toBeNull()
  // They keep their own way out.
  expect(screen.getByText('Cancel Offer')).toBeTruthy()
})
