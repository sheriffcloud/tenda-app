/**
 * constants/escrow-action-copy — the confirm-gate + success-toast copy every
 * client renders (moved from apps/mobile/components/escrow/tx-action/copy.ts).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ESCROW_TX_TYPES, type EscrowTxType } from '../../src/constants/escrow'
import {
  TX_PROGRESS_LABEL,
  txSuccessCopy,
  WALLET_OPEN_NOTE,
  isGatedTxAction,
  txConfirmCopy,
  type TxConfirmContext,
} from '../../src/constants/escrow-action-copy'

const GIG: TxConfirmContext = { amount: '50 USDC', kind: 'gig' }
const EXCHANGE: TxConfirmContext = { amount: '50 USDC', kind: 'exchange' }

test('TX_PROGRESS_LABEL covers every escrow tx type, total and exact', () => {
  for (const type of ESCROW_TX_TYPES) {
    assert.ok(TX_PROGRESS_LABEL[type], type)
  }
  // Total, not a superset: keys match the shared vocabulary exactly.
  assert.deepStrictEqual(Object.keys(TX_PROGRESS_LABEL).sort(), [...ESCROW_TX_TYPES].sort())
})

test('isGatedTxAction gates the wallet-opening transitions', () => {
  const gated: EscrowTxType[] = [
    'create',
    'accept',
    'approve',
    'claim_stalled',
    'cancel',
    'refund_expired',
    'reclaim_abandoned',
    // Gated from the moment the gig CTA started offering it: a direct-invite
    // worker had no Decline button before, so nothing ever reached the gate.
    'decline',
  ]
  for (const a of gated) assert.strictEqual(isGatedTxAction(a), true, a)
})

test('isGatedTxAction does not gate input-sheet or admin actions', () => {
  // These three are gated by their own input sheets instead.
  const ungated: EscrowTxType[] = ['submit', 'dispute', 'resolve']
  for (const a of ungated) assert.strictEqual(isGatedTxAction(a), false, a)
})

test('txConfirmCopy returns null for ungated actions', () => {
  assert.strictEqual(txConfirmCopy('submit', GIG), null)
  assert.strictEqual(txConfirmCopy('dispute', GIG), null)
  assert.strictEqual(txConfirmCopy('resolve', GIG), null)
})

/**
 * `isGatedTxAction` (a list) and `txConfirmCopy` (a switch) answer the same
 * question from two places, and the dialog trusts the second: `visible` is
 * `copy !== null`. A list entry with no copy renders an invisible dialog
 * whose confirm never fires — a button that silently does nothing, which is
 * exactly what an ungated `decline` was.
 */
test('txConfirmCopy agrees with isGatedTxAction in BOTH directions, for every tx type', () => {
  for (const action of ESCROW_TX_TYPES) {
    assert.strictEqual(txConfirmCopy(action, GIG) !== null, isGatedTxAction(action), `${action} gig`)
    assert.strictEqual(
      txConfirmCopy(action, EXCHANGE) !== null,
      isGatedTxAction(action),
      `${action} exchange`,
    )
  }
})

test('every gated action gets a non-empty title, label and the wallet note', () => {
  for (const type of ESCROW_TX_TYPES) {
    if (!isGatedTxAction(type)) continue
    const copy = txConfirmCopy(type, GIG)
    assert.notStrictEqual(copy, null, type)
    assert.ok(copy?.title, type)
    assert.ok(copy?.confirmLabel, type)
    assert.ok(copy?.body.includes(WALLET_OPEN_NOTE), type)
  }
})

test('surfaces the amount in value-moving actions', () => {
  for (const a of ['create', 'approve', 'claim_stalled', 'cancel', 'refund_expired', 'reclaim_abandoned'] as const) {
    assert.ok(txConfirmCopy(a, GIG)?.body.includes('50 USDC'), a)
  }
})

test('marks cancel as destructive and approve as non-destructive', () => {
  assert.strictEqual(txConfirmCopy('cancel', GIG)?.destructive, true)
  assert.strictEqual(txConfirmCopy('approve', GIG)?.destructive, false)
})

test('uses gig vs exchange wording and labels', () => {
  assert.strictEqual(txConfirmCopy('create', GIG)?.confirmLabel, 'Fund Gig')
  assert.strictEqual(txConfirmCopy('create', EXCHANGE)?.confirmLabel, 'Publish Offer')
  assert.strictEqual(txConfirmCopy('approve', GIG)?.confirmLabel, 'Approve & Pay')
  assert.strictEqual(txConfirmCopy('approve', EXCHANGE)?.confirmLabel, 'Confirm & Release')
  assert.ok(txConfirmCopy('approve', GIG)?.body.includes('worker'))
  assert.ok(txConfirmCopy('approve', EXCHANGE)?.body.includes('buyer'))
  assert.strictEqual(txConfirmCopy('claim_stalled', GIG)?.confirmLabel, 'Claim Payment')
  assert.strictEqual(txConfirmCopy('claim_stalled', EXCHANGE)?.confirmLabel, 'Claim Crypto')
  assert.strictEqual(txConfirmCopy('cancel', GIG)?.confirmLabel, 'Cancel Gig')
  assert.strictEqual(txConfirmCopy('cancel', EXCHANGE)?.confirmLabel, 'Cancel Offer')
})

test('names the concrete deliver-within window for gig accept, falls back otherwise', () => {
  assert.ok(txConfirmCopy('accept', { ...GIG, deliverWithin: '2 days' })?.body.includes('2 days'))
  // null / empty → generic window copy, still valid
  assert.ok(txConfirmCopy('accept', { ...GIG, deliverWithin: null })?.body.includes('agreed time window'))
  assert.ok(txConfirmCopy('accept', { ...GIG, deliverWithin: '' })?.body.includes('agreed time window'))
})

// ---------- net-of-fee honesty ----------

const NET = { netAmount: '49.5 USDC', feePct: '1.00' }

test("approve quotes the receiver's NET, not just the gross escrow", () => {
  const gig = txConfirmCopy('approve', { ...GIG, ...NET })?.body
  assert.ok(gig?.includes('receives 49.5 USDC'))
  assert.ok(gig?.includes('1.00% platform fee'))
  const ex = txConfirmCopy('approve', { ...EXCHANGE, ...NET })?.body
  assert.ok(ex?.includes('buyer receives 49.5 USDC'))
})

test('claim_stalled tells the claimant the NET landing in their wallet', () => {
  const body = txConfirmCopy('claim_stalled', { ...GIG, ...NET })?.body
  assert.ok(body?.includes('sends 49.5 USDC to your wallet'))
  assert.ok(body?.includes('1.00% platform fee'))
})

test('exchange accept tells the buyer their NET up front', () => {
  const body = txConfirmCopy('accept', { ...EXCHANGE, ...NET })?.body
  assert.ok(body?.includes('you receive 49.5 USDC'))
})

test('without a net (config not loaded) it never claims the gross is credited', () => {
  assert.ok(txConfirmCopy('approve', GIG)?.body.includes('less the platform fee'))
  assert.ok(txConfirmCopy('claim_stalled', GIG)?.body.includes('less the platform fee'))
  // Never a bare "sends the 50 USDC to your wallet." with no fee mention.
  assert.doesNotMatch(txConfirmCopy('claim_stalled', GIG)?.body ?? '', /wallet\.$/m)
})

test('the seller-side create copy is untouched — the creator DOES lock the full amount', () => {
  assert.ok(txConfirmCopy('create', { ...EXCHANGE, ...NET })?.body.includes('locks 50 USDC'))
})

// ---------- approval mode (assign / unassign) ----------

test('assign_accept warns that the worker never signs, and names the window when known', () => {
  const withWindow = txConfirmCopy('assign_accept', { ...GIG, deliverWithin: '48 hours' })
  assert.ok(withWindow?.body.includes('48 hours'))
  assert.ok(withWindow?.body.includes("don't sign anything"))
  // Falls back cleanly when the window is unknown, never printing "undefined".
  const without = txConfirmCopy('assign_accept', GIG)?.body
  assert.ok(without?.includes('delivery window starts now'))
  assert.ok(!without?.includes('undefined'))
})

test('unassign is destructive and promises the escrow is untouched', () => {
  const copy = txConfirmCopy('unassign', GIG)
  assert.strictEqual(copy?.destructive, true)
  assert.ok(copy?.body.includes('50 USDC stays in escrow'))
  assert.ok(copy?.body.includes('back to open'))
})

test('assign/unassign both carry the shared wallet note', () => {
  assert.ok(txConfirmCopy('assign_accept', GIG)?.body.includes(WALLET_OPEN_NOTE))
  assert.ok(txConfirmCopy('unassign', GIG)?.body.includes(WALLET_OPEN_NOTE))
})

// ---------- txSuccessCopy ----------

test('txSuccessCopy is kind-aware where the two surfaces read differently', () => {
  assert.strictEqual(txSuccessCopy('accept', 'gig'), 'Gig accepted!')
  assert.strictEqual(txSuccessCopy('accept', 'exchange'), 'Offer accepted!')
  assert.ok(txSuccessCopy('cancel', 'gig').includes('Gig cancelled'))
  assert.ok(txSuccessCopy('cancel', 'exchange').includes('Offer cancelled'))
})

test('exchange copy never leaks gig vocabulary', () => {
  for (const type of ESCROW_TX_TYPES) {
    assert.doesNotMatch(txSuccessCopy(type, 'exchange'), /\b(gig|worker|poster)\b/i, type)
  }
})

test('covers both kinds for every action a party can trigger', () => {
  // The two per-screen maps this replaced had already diverged — one carried
  // `create`, the other `reclaim_abandoned`. Neither may regress to the
  // neutral fallback.
  const triggerable: EscrowTxType[] = [
    'create',
    'accept',
    // Was missing from this list while BOTH bars offered the button, so a
    // declining invitee got the neutral fallback on either surface — the one
    // action with confirm copy for both kinds and success copy for neither.
    'decline',
    'submit',
    'approve',
    'claim_stalled',
    'cancel',
    'refund_expired',
    'reclaim_abandoned',
    'dispute',
  ]
  for (const type of triggerable) {
    assert.notStrictEqual(txSuccessCopy(type, 'gig'), 'Transaction confirmed', type)
    assert.notStrictEqual(txSuccessCopy(type, 'exchange'), 'Transaction confirmed', type)
  }
})

test("approval-mode actions read from the poster's side, gig-only", () => {
  assert.ok(txSuccessCopy('assign_accept', 'gig').includes('Worker assigned'))
  assert.ok(txSuccessCopy('unassign', 'gig').includes('open again'))
  // No exchange wording exists for them, so the neutral fallback stands
  // rather than a gig string leaking onto a P2P screen.
  assert.strictEqual(txSuccessCopy('assign_accept', 'exchange'), 'Transaction confirmed')
})

test('an unmapped action degrades to a neutral confirmation, never throws', () => {
  assert.strictEqual(txSuccessCopy('resolve', 'gig'), 'Transaction confirmed')
})
