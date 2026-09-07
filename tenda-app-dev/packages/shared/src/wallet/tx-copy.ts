/**
 * Wallet-feed presentation for one escrow transaction: whose side you are on,
 * what the row is called from there, which way value moved, and how much.
 *
 * Split out of TxRow so the component stays a renderer, and because the copy
 * is now two-dimensional — the same on-chain row reads differently to each
 * party ("Payout released" to the poster, "Gig payout" to the worker). Which
 * rows reach you at all is the server's call (shared TX_FEED_VISIBILITY); this
 * module only words the ones that arrive.
 */

import { amountRawToDisplay, getAssetMeta } from '../constants/assets'
import type { EscrowTxType } from '../constants/escrow'
import type { PartyRole } from '../utils/parties'
import type { EscrowKind, UserEscrowTransaction } from '../types'

/**
 * Base copy per kind. TOTAL over EscrowTxType on both kinds, so a new
 * transaction type breaks the build here instead of rendering its raw enum
 * slug in someone's history. This had already bitten twice under the old
 * `Partial` + `?? tx.type` shape.
 *
 * Worded for whichever side normally sees the row. Where BOTH sides see it and
 * the wording would mislead one of them, TX_LABEL_BY_ROLE overrides below.
 */
const TX_LABEL: Readonly<Record<EscrowKind, Readonly<Record<EscrowTxType, string>>>> = {
  gig: {
    create: 'Gig funded',
    accept: 'Gig accepted',
    decline: 'Assignment declined',
    assign_accept: 'Worker assigned',
    unassign: 'Assignment withdrawn',
    submit: 'Proof submitted',
    approve: 'Gig payout',
    claim_stalled: 'Payment claimed',
    cancel: 'Refund received',
    refund_expired: 'Refund (expired)',
    reclaim_abandoned: 'Escrow reclaimed',
    dispute: 'Dispute opened',
    resolve: 'Dispute resolved',
  },
  exchange: {
    create: 'Exchange escrow',
    accept: 'Offer accepted',
    decline: 'Match declined',
    assign_accept: 'Buyer matched',
    unassign: 'Match withdrawn',
    submit: 'Payment marked',
    approve: 'Crypto released',
    claim_stalled: 'Payment claimed',
    cancel: 'Offer refunded',
    refund_expired: 'Refund (expired)',
    reclaim_abandoned: 'Escrow reclaimed',
    dispute: 'Dispute opened',
    resolve: 'Dispute resolved',
  },
}

/**
 * Per-side overrides, only for rows BOTH parties receive. Deliberately sparse:
 * the base map above is total, so a combination missing here falls back to
 * wording that already exists — a missing override can never surface a raw
 * enum slug, which is the property the totality of TX_LABEL buys us.
 *
 * Every entry here corresponds to a type whose TX_FEED_VISIBILITY row is
 * `always` for BOTH roles. `resolve` needs none (identical from either side).
 */
export const TX_LABEL_BY_ROLE: Readonly<
  Record<EscrowKind, Partial<Record<EscrowTxType, Partial<Record<PartyRole, string>>>>>
> = {
  gig: {
    // The poster released the payment; the worker received it.
    approve: { creator: 'Payout released' },
    // The poster placed the worker; the worker was placed.
    assign_accept: { counterparty: 'Assigned to you' },
  },
  exchange: {
    approve: { counterparty: 'Crypto received' },
    assign_accept: { counterparty: 'Matched to you' },
  },
}

/**
 * Your structural side of this escrow, or null when you are neither party.
 * Null is reachable in practice: `unassign` clears `counterparty_id`, so a
 * released worker stops matching either column.
 */
export function viewerRole(tx: UserEscrowTransaction, userId: string): PartyRole | null {
  if (tx.escrow.creator_id === userId) return 'creator'
  if (tx.escrow.counterparty_id === userId) return 'counterparty'
  return null
}

/** Row copy from `role`'s side; falls back to the kind's base wording. */
export function txLabel(
  kind: EscrowKind,
  type: EscrowTxType,
  role: PartyRole | null,
): string {
  const override = role !== null ? TX_LABEL_BY_ROLE[kind][type]?.[role] : undefined
  return override ?? TX_LABEL[kind][type]
}

/**
 * Direction of value FROM THE VIEWER'S PERSPECTIVE, null for neutral
 * lifecycle rows (accept/submit/assign carry no transfer to the viewer).
 */
export function txSign(
  tx: UserEscrowTransaction,
  role: PartyRole | null,
): '+' | '-' | null {
  switch (tx.type) {
    case 'create':
      return role === 'creator' ? '-' : null
    case 'approve':
    case 'claim_stalled':
      return role === 'counterparty' ? '+' : null
    case 'cancel':
    case 'refund_expired':
    case 'reclaim_abandoned':
      return role === 'creator' ? '+' : null
    case 'resolve': {
      if (tx.winner === null || role === null) return null
      // A split pays both sides; otherwise only the named winner is credited.
      return tx.winner === 'split' || tx.winner === role ? '+' : null
    }
    default:
      return null
  }
}

/**
 * Types whose amount is ONLY ever the chain-attested figure. Falling back to
 * the escrow principal would overstate what actually moved, so a row with no
 * attested amount shows no number at all (project_settlement_amount_honesty).
 * `dispute` is here because its figure is the BOND — printing the full escrow
 * principal on a "Dispute opened" row would be off by orders of magnitude.
 */
const ATTESTED_ONLY: readonly EscrowTxType[] = ['approve', 'claim_stalled', 'resolve', 'dispute']

/**
 * The base-unit amount this row shows the viewer, or null for no number.
 * Resolve pays per side, so each viewer sees THEIR share. Non-credit rows
 * (funding, refunds) fall back to the principal, which IS their exact figure.
 */
export function txAmountRaw(
  tx: UserEscrowTransaction,
  role: PartyRole | null,
): string | null {
  if (tx.type === 'resolve') {
    if (role === 'creator') return tx.creator_payout_raw
    if (role === 'counterparty') return tx.amount_raw
    return null
  }
  if (tx.amount_raw !== null) return tx.amount_raw
  return ATTESTED_ONLY.includes(tx.type) ? null : tx.escrow.amount_raw
}

/**
 * Display-unit amount + symbol for the row, or null when it shows no money at
 * all (no amount applies to this row for this viewer, or the amount is zero).
 *
 * `amount` is separately nullable: this build may have no metadata for the
 * asset and therefore not know its decimals. The SYMBOL still survives that —
 * the raw asset id names what the row is denominated in, and saying "— USDC_X"
 * is strictly more use than dropping the row, which is why the whole row is
 * not nulled here.
 */
export function txDisplayAmount(
  tx: UserEscrowTransaction,
  role: PartyRole | null,
): { amount: number | null; symbol: string } | null {
  const raw = txAmountRaw(tx, role)
  if (raw === null) return null
  const amount = amountRawToDisplay(raw, tx.escrow.asset)
  if (amount !== null && amount <= 0) return null
  return { amount, symbol: getAssetMeta(tx.escrow.asset)?.symbol ?? tx.escrow.asset }
}
