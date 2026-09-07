import { ESCROW_TX_TYPES, type EscrowTxType } from '@tenda/shared'
import {
  TX_PROGRESS_LABEL,
  txSuccessCopy,
  WALLET_OPEN_NOTE,
  isGatedTxAction,
  txConfirmCopy,
  type TxConfirmContext,
} from '../copy'

const GIG: TxConfirmContext = { amount: '50 USDC', kind: 'gig' }
const EXCHANGE: TxConfirmContext = { amount: '50 USDC', kind: 'exchange' }

describe('TX_PROGRESS_LABEL', () => {
  it('covers every escrow tx type (no blank progress heading can slip through)', () => {
    for (const type of ESCROW_TX_TYPES) {
      expect(TX_PROGRESS_LABEL[type]).toBeTruthy()
    }
    // Total, not a superset: keys match the shared vocabulary exactly.
    expect(Object.keys(TX_PROGRESS_LABEL).sort()).toEqual([...ESCROW_TX_TYPES].sort())
  })
})

describe('isGatedTxAction', () => {
  it('gates the wallet-opening transitions', () => {
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
    for (const a of gated) expect(isGatedTxAction(a)).toBe(true)
  })

  it('does not gate input-sheet or admin actions', () => {
    // These three are gated by their own input sheets instead.
    const ungated: EscrowTxType[] = ['submit', 'dispute', 'resolve']
    for (const a of ungated) expect(isGatedTxAction(a)).toBe(false)
  })
})

describe('txConfirmCopy — gated actions', () => {
  it('returns null for ungated actions', () => {
    expect(txConfirmCopy('submit', GIG)).toBeNull()
    expect(txConfirmCopy('dispute', GIG)).toBeNull()
    expect(txConfirmCopy('resolve', GIG)).toBeNull()
  })

  /**
   * `isGatedTxAction` (a list) and `txConfirmCopy` (a switch) answer the same
   * question from two places, and the dialog trusts the second: `visible` is
   * `copy !== null`. A list entry with no copy renders an invisible dialog
   * whose confirm never fires — a button that silently does nothing, which is
   * exactly what an ungated `decline` was.
   */
  it('agrees with isGatedTxAction in BOTH directions, for every tx type', () => {
    for (const action of ESCROW_TX_TYPES) {
      expect(txConfirmCopy(action, GIG) !== null).toBe(isGatedTxAction(action))
      expect(txConfirmCopy(action, EXCHANGE) !== null).toBe(isGatedTxAction(action))
    }
  })

  it('every gated action gets a non-empty title, label and the wallet note', () => {
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
    for (const a of gated) {
      const copy = txConfirmCopy(a, GIG)
      expect(copy).not.toBeNull()
      expect(copy?.title).toBeTruthy()
      expect(copy?.confirmLabel).toBeTruthy()
      expect(copy?.body).toContain(WALLET_OPEN_NOTE)
    }
  })

  it('surfaces the amount in value-moving actions', () => {
    for (const a of ['create', 'approve', 'claim_stalled', 'cancel', 'refund_expired', 'reclaim_abandoned'] as const) {
      expect(txConfirmCopy(a, GIG)?.body).toContain('50 USDC')
    }
  })

  it('marks cancel as destructive and approve as non-destructive', () => {
    expect(txConfirmCopy('cancel', GIG)?.destructive).toBe(true)
    expect(txConfirmCopy('approve', GIG)?.destructive).toBe(false)
  })

  it('uses gig vs exchange wording and labels', () => {
    expect(txConfirmCopy('create', GIG)?.confirmLabel).toBe('Fund Gig')
    expect(txConfirmCopy('create', EXCHANGE)?.confirmLabel).toBe('Publish Offer')
    expect(txConfirmCopy('approve', GIG)?.confirmLabel).toBe('Approve & Pay')
    expect(txConfirmCopy('approve', EXCHANGE)?.confirmLabel).toBe('Confirm & Release')
    expect(txConfirmCopy('approve', GIG)?.body).toContain('worker')
    expect(txConfirmCopy('approve', EXCHANGE)?.body).toContain('buyer')
    expect(txConfirmCopy('claim_stalled', GIG)?.confirmLabel).toBe('Claim Payment')
    expect(txConfirmCopy('claim_stalled', EXCHANGE)?.confirmLabel).toBe('Claim Crypto')
    expect(txConfirmCopy('cancel', GIG)?.confirmLabel).toBe('Cancel Gig')
    expect(txConfirmCopy('cancel', EXCHANGE)?.confirmLabel).toBe('Cancel Offer')
  })

  it('names the concrete deliver-within window for gig accept, falls back otherwise', () => {
    expect(txConfirmCopy('accept', { ...GIG, deliverWithin: '2 days' })?.body).toContain('2 days')
    // null / empty → generic window copy, still valid
    expect(txConfirmCopy('accept', { ...GIG, deliverWithin: null })?.body).toContain('agreed time window')
    expect(txConfirmCopy('accept', { ...GIG, deliverWithin: '' })?.body).toContain('agreed time window')
  })
})

describe('txConfirmCopy — net-of-fee honesty', () => {
  const NET = { netAmount: '49.5 USDC', feePct: '1.00' }

  it('approve quotes the receiver\'s NET, not just the gross escrow', () => {
    const gig = txConfirmCopy('approve', { ...GIG, ...NET })?.body
    expect(gig).toContain('receives 49.5 USDC')
    expect(gig).toContain('1.00% platform fee')
    const ex = txConfirmCopy('approve', { ...EXCHANGE, ...NET })?.body
    expect(ex).toContain('buyer receives 49.5 USDC')
  })

  it('claim_stalled tells the claimant the NET landing in their wallet', () => {
    const body = txConfirmCopy('claim_stalled', { ...GIG, ...NET })?.body
    expect(body).toContain('sends 49.5 USDC to your wallet')
    expect(body).toContain('1.00% platform fee')
  })

  it('exchange accept tells the buyer their NET up front', () => {
    const body = txConfirmCopy('accept', { ...EXCHANGE, ...NET })?.body
    expect(body).toContain('you receive 49.5 USDC')
  })

  it('without a net (config not loaded) it never claims the gross is credited', () => {
    expect(txConfirmCopy('approve', GIG)?.body).toContain('less the platform fee')
    expect(txConfirmCopy('claim_stalled', GIG)?.body).toContain('less the platform fee')
    // Only one of the pair is present, never a bare "sends the 50 USDC to your wallet".
    expect(txConfirmCopy('claim_stalled', GIG)?.body).not.toMatch(/wallet\.$/m)
  })

  it('the seller-side create copy is untouched — the creator DOES lock the full amount', () => {
    expect(txConfirmCopy('create', { ...EXCHANGE, ...NET })?.body).toContain('locks 50 USDC')
  })
})

describe('approval mode (assign / unassign)', () => {
  it('every gated action has copy — a gate with no dialog is silently ungated', () => {
    for (const type of ESCROW_TX_TYPES) {
      if (!isGatedTxAction(type)) continue
      const copy = txConfirmCopy(type, GIG)
      expect(copy).not.toBeNull()
      expect(copy?.title).toBeTruthy()
      expect(copy?.confirmLabel).toBeTruthy()
    }
  })

  it('assign_accept warns that the worker never signs, and names the window when known', () => {
    const withWindow = txConfirmCopy('assign_accept', { ...GIG, deliverWithin: '48 hours' })
    expect(withWindow?.body).toContain('48 hours')
    expect(withWindow?.body).toContain("don't sign anything")
    // Falls back cleanly when the window is unknown, never printing "undefined".
    const without = txConfirmCopy('assign_accept', GIG)?.body
    expect(without).toContain('delivery window starts now')
    expect(without).not.toContain('undefined')
  })

  it('unassign is destructive and promises the escrow is untouched', () => {
    const copy = txConfirmCopy('unassign', GIG)
    expect(copy?.destructive).toBe(true)
    expect(copy?.body).toContain('50 USDC stays in escrow')
    expect(copy?.body).toContain('back to open')
  })

  it('both carry the shared wallet note', () => {
    expect(txConfirmCopy('assign_accept', GIG)?.body).toContain(WALLET_OPEN_NOTE)
    expect(txConfirmCopy('unassign', GIG)?.body).toContain(WALLET_OPEN_NOTE)
  })
})

describe('txSuccessCopy', () => {
  it('is kind-aware where the two surfaces read differently', () => {
    expect(txSuccessCopy('accept', 'gig')).toBe('Gig accepted!')
    expect(txSuccessCopy('accept', 'exchange')).toBe('Offer accepted!')
    expect(txSuccessCopy('cancel', 'gig')).toContain('Gig cancelled')
    expect(txSuccessCopy('cancel', 'exchange')).toContain('Offer cancelled')
  })

  it('exchange copy never leaks gig vocabulary', () => {
    for (const type of ESCROW_TX_TYPES) {
      expect(txSuccessCopy(type, 'exchange')).not.toMatch(/\b(gig|worker|poster)\b/i)
    }
  })

  it('covers both kinds for every action a party can trigger', () => {
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
      expect(txSuccessCopy(type, 'gig')).not.toBe('Transaction confirmed')
      expect(txSuccessCopy(type, 'exchange')).not.toBe('Transaction confirmed')
    }
  })

  it('approval-mode actions read from the poster’s side, gig-only', () => {
    expect(txSuccessCopy('assign_accept', 'gig')).toContain('Worker assigned')
    expect(txSuccessCopy('unassign', 'gig')).toContain('open again')
    // No exchange wording exists for them, so the neutral fallback stands
    // rather than a gig string leaking onto a P2P screen.
    expect(txSuccessCopy('assign_accept', 'exchange')).toBe('Transaction confirmed')
  })

  it('an unmapped action degrades to a neutral confirmation, never throws', () => {
    expect(txSuccessCopy('resolve', 'gig')).toBe('Transaction confirmed')
  })
})
