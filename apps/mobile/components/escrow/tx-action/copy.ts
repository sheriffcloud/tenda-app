/**
 * Copy for the on-chain transition feedback (blockchain-newcomer UX): a
 * pre-sign confirm gate that spells out what an action does + that the wallet
 * is about to open, plus the present-tense verb the progress modal shows while
 * the tx is in flight. Single source shared by the gig, exchange, and post-gig
 * screens so the wording never drifts between them.
 */
import { type EscrowTxType } from '@tenda/shared'

/** Whether the transition applies to a gig or a P2P exchange offer. */
export type EscrowKind = 'gig' | 'exchange'

/**
 * Present-tense label shown in the progress modal while the tx confirms, e.g.
 * "Releasing payment…". Total over EscrowTxType so a new action can never
 * silently fall through to a blank heading (TS errors until it's added here).
 */
export const TX_PROGRESS_LABEL: Record<EscrowTxType, string> = {
  create: 'Funding escrow',
  accept: 'Accepting',
  decline: 'Declining',
  // Approval mode. The poster's wording, not the worker's — these two are the
  // only transitions where the CREATOR moves an escrow that a worker will do
  // the work on.
  assign_accept: 'Assigning worker',
  unassign: 'Releasing assignment',
  submit: 'Submitting',
  approve: 'Releasing payment',
  claim_stalled: 'Claiming payment',
  cancel: 'Cancelling',
  refund_expired: 'Processing refund',
  reclaim_abandoned: 'Reclaiming escrow',
  dispute: 'Raising dispute',
  resolve: 'Resolving',
}

/**
 * Actions routed through the shared confirm gate (a wallet-opening move whose
 * consequence the user should read first). `submit`/`dispute` are excluded:
 * they collect input in their own sheets, which carry the wallet note inline.
 */
const GATED_ACTIONS: readonly EscrowTxType[] = [
  'create',
  'accept',
  'approve',
  'claim_stalled',
  'cancel',
  'refund_expired',
  'reclaim_abandoned',
  'assign_accept',
  'unassign',
  // Added when the gig CTA started OFFERING it: a direct-invite worker had no
  // Decline button, so nothing ever reached the gate.
  'decline',
]

/** Appended to every gated body so the wallet popup is never a surprise. */
export const WALLET_OPEN_NOTE = 'Your wallet will open next — approve there to finish.'

export function isGatedTxAction(action: EscrowTxType): boolean {
  return GATED_ACTIONS.includes(action)
}

export interface TxConfirmContext {
  /** Pre-formatted principal, e.g. "50 USDC" (shared formatAssetAmount). */
  amount: string
  kind: EscrowKind
  /** Accept dialog names the concrete "deliver within" window when known. */
  deliverWithin?: string | null
  /**
   * Pre-formatted NET the receiving side is credited (principal − platform
   * fee, from useEscrowFee). When absent (config not loaded) the copy falls
   * back to naming the escrowed principal without claiming who receives it —
   * it must never quote the gross as the credited amount.
   */
  netAmount?: string | null
  /** Fee percentage that produced netAmount, e.g. "1.00". */
  feePct?: string | null
}

export interface TxConfirmCopy {
  title: string
  body: string
  confirmLabel: string
  /** Renders the confirm button in the danger style. */
  destructive: boolean
}

/** Per-action copy, before the shared wallet note is appended. */
function buildCopy(action: EscrowTxType, ctx: TxConfirmContext): TxConfirmCopy | null {
  const { amount, kind, deliverWithin, netAmount = null, feePct = null } = ctx
  const hasNet = netAmount !== null && feePct !== null
  switch (action) {
    case 'create':
      return kind === 'gig'
        ? {
            title: 'Fund this gig?',
            body: `This locks ${amount} in escrow to fund the gig. Workers only see it once the payment confirms on-chain.`,
            confirmLabel: 'Fund Gig',
            destructive: false,
          }
        : {
            title: 'Publish this offer?',
            body: `This locks ${amount} in escrow. Buyers can accept once it confirms on-chain.`,
            confirmLabel: 'Publish Offer',
            destructive: false,
          }
    case 'accept':
      return kind === 'gig'
        ? {
            title: 'Accept this gig?',
            body:
              deliverWithin != null && deliverWithin !== ''
                ? `Once you accept, you must deliver within ${deliverWithin}. Only accept if you can complete it in time.`
                : 'Once you accept, you must deliver within the agreed time window.',
            confirmLabel: 'Accept Gig',
            destructive: false,
          }
        : {
            title: 'Accept this offer?',
            body: hasNet
              ? `You'll be matched as the buyer for ${amount} — you receive ${netAmount} after the ${feePct}% platform fee. Pay the seller off-platform, then mark it as paid.`
              : `You'll be matched as the buyer for ${amount}. Pay the seller off-platform, then mark it as paid.`,
            confirmLabel: 'Accept Offer',
            destructive: false,
          }
    case 'approve': {
      const receiver = kind === 'gig' ? 'worker' : 'buyer'
      return {
        title: kind === 'gig' ? 'Release payment?' : 'Confirm payment received?',
        body: hasNet
          ? `This releases the ${amount} escrow — the ${receiver} receives ${netAmount} after the ${feePct}% platform fee. It can't be undone.`
          : `This releases the ${amount} escrow to the ${receiver} (less the platform fee). It can't be undone.`,
        confirmLabel: kind === 'gig' ? 'Approve & Pay' : 'Confirm & Release',
        destructive: false,
      }
    }
    case 'claim_stalled':
      return {
        title: kind === 'gig' ? 'Claim payment?' : 'Claim crypto?',
        body: hasNet
          ? `This sends ${netAmount} to your wallet — the ${feePct}% platform fee is deducted from the ${amount} escrow.`
          : `This sends the escrowed ${amount} to your wallet, less the platform fee.`,
        confirmLabel: kind === 'gig' ? 'Claim Payment' : 'Claim Crypto',
        destructive: false,
      }
    case 'cancel':
      return {
        title: kind === 'gig' ? 'Cancel this gig?' : 'Cancel this offer?',
        body: `The ${amount} escrow will be refunded to your wallet on-chain.`,
        confirmLabel: kind === 'gig' ? 'Cancel Gig' : 'Cancel Offer',
        destructive: true,
      }
    case 'refund_expired':
      return {
        title: 'Claim refund?',
        body: `The ${amount} escrow will be returned to your wallet. This closes it and can't be undone.`,
        confirmLabel: 'Claim Refund',
        destructive: false,
      }
    case 'reclaim_abandoned':
      return {
        title: 'Reclaim escrow?',
        body: `The counterparty didn't complete in time. The ${amount} escrow will be returned to your wallet.`,
        confirmLabel: 'Reclaim Escrow',
        destructive: false,
      }
    case 'assign_accept':
      return {
        title: 'Assign this worker?',
        body:
          deliverWithin != null && deliverWithin !== ''
            ? `They become the worker immediately and have ${deliverWithin} to deliver. They don't sign anything, so make sure you've picked the right person.`
            : "They become the worker immediately and their delivery window starts now. They don't sign anything, so make sure you've picked the right person.",
        confirmLabel: 'Assign Worker',
        destructive: false,
      }
    case 'unassign':
      return {
        title: 'Release this assignment?',
        body: `This removes the worker and puts the gig back to open. Your ${amount} stays in escrow, and you can assign someone else.`,
        confirmLabel: 'Release Assignment',
        // Someone may already have started work on the strength of the
        // assignment — worth the extra pause.
        destructive: true,
      }
    case 'decline':
      // Gated since the gig CTA started OFFERING it (it was a real transition
      // with no button before). On-chain, so it goes through the same gate as
      // every other wallet-opening move; the escrow itself is untouched, which
      // is the one thing the invitee needs to know before signing.
      return kind === 'gig'
        ? {
            title: 'Decline this gig?',
            body: `The poster's ${amount} stays in escrow and the gig opens up to other workers. You can't take it back, but they can invite you again.`,
            confirmLabel: 'Decline Gig',
            destructive: true,
          }
        : {
            title: 'Decline this offer?',
            body: `The seller's ${amount} stays in escrow and the offer opens up to other buyers. You can't take it back.`,
            confirmLabel: 'Decline Offer',
            destructive: true,
          }
    default:
      // submit / dispute / resolve are gated by their own sheets instead.
      return null
  }
}

/**
 * Toast shown once a transition CONFIRMS on-chain — the other half of the same
 * copy surface as the confirm gate above, and kind-aware for the same reason
 * ("Gig accepted!" vs "Offer accepted!").
 *
 * This lived as a `SUCCESS_BY_ACTION` map inside each of the gig and exchange
 * screens, which is precisely the drift this module exists to prevent: the two
 * had already diverged (only one carried `create`, only one carried
 * `reclaim_abandoned`), and every new action had to be remembered twice.
 *
 * Unmatched actions fall back to a neutral confirmation rather than throwing —
 * a missing toast string must never break a settled transaction.
 */
const SUCCESS_FALLBACK = 'Transaction confirmed'

const GIG_SUCCESS: Partial<Record<EscrowTxType, string>> = {
  create: 'Gig posted, it goes live once the escrow confirms.',
  accept: 'Gig accepted!',
  assign_accept: 'Worker assigned, their delivery window has started.',
  unassign: 'Assignment released, the gig is open again.',
  decline: 'Invitation declined, the gig is open to other workers.',
  submit: 'Proof submitted!',
  approve: 'Payment released to worker!',
  claim_stalled: 'Payment claimed!',
  cancel: 'Gig cancelled, escrow refunded.',
  refund_expired: 'Refund claimed successfully.',
  reclaim_abandoned: 'Escrow reclaimed.',
  dispute: 'Dispute raised. An admin will review shortly.',
}

const EXCHANGE_SUCCESS: Partial<Record<EscrowTxType, string>> = {
  create: 'Offer published, it goes live once the escrow confirms.',
  accept: 'Offer accepted!',
  decline: 'Invitation declined, the offer is open to other buyers.',
  submit: 'Payment marked, waiting for the seller to confirm.',
  approve: 'Payment confirmed, crypto released.',
  claim_stalled: 'Payment claimed!',
  cancel: 'Offer cancelled, escrow refunded.',
  refund_expired: 'Refund claimed successfully.',
  reclaim_abandoned: 'Escrow reclaimed.',
  dispute: 'Dispute raised. An admin will review shortly.',
}

export function txSuccessCopy(action: EscrowTxType, kind: EscrowKind): string {
  const table = kind === 'exchange' ? EXCHANGE_SUCCESS : GIG_SUCCESS
  return table[action] ?? SUCCESS_FALLBACK
}

/**
 * Confirm-gate copy for a gated action, or null for actions that don't route
 * through the gate. The shared wallet note is appended once here (DRY).
 */
export function txConfirmCopy(action: EscrowTxType, ctx: TxConfirmContext): TxConfirmCopy | null {
  const copy = buildCopy(action, ctx)
  if (copy === null) return null
  return { ...copy, body: `${copy.body}\n\n${WALLET_OPEN_NOTE}` }
}
