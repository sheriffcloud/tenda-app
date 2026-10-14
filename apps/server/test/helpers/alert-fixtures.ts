/**
 * Resolved-alert fixtures — the fat, post-resolver shape a CHANNEL renders.
 *
 * Distinct from the thin `AlertRef` that rides the queue, which tests build
 * inline because it is three fields. This shape is ten, and every channel test
 * needs one, so a per-file copy is a per-file thing to update.
 *
 * The compiler already forces each copy to be complete, so drift here would be
 * loud rather than silent — the reason to centralise is not safety but that
 * three files spelling the same object is three chances to encode a different
 * idea of what a typical alert looks like.
 *
 * Defaults describe the COMMON case; every field is overridable, because most
 * of what these tests assert is what happens when one of them is absent.
 */
import { randomUUID } from 'node:crypto'
import type { AlertOf } from '@server/features/alerts'

export function disputeRaisedAlert(
  over: Partial<AlertOf<'dispute.raised'>> = {},
): AlertOf<'dispute.raised'> {
  return {
    kind: 'dispute.raised',
    escrow_id: randomUUID(),
    tx_ref: `sig-${randomUUID()}`,
    dispute_id: randomUUID(),
    escrow_kind: 'gig',
    escrow_title: 'Deliver 500 flyers',
    reason: 'Work was never delivered',
    /**
     * Null by default, which is the case a channel is most likely to get wrong:
     * a dispute can be on-chain with no triage row and an actor wallet that maps
     * to no user. A fixture that named a raiser by default would let copy which
     * cannot cope with an unknown one pass everywhere except production.
     */
    raised_by_id: null,
    creator_id: randomUUID(),
    counterparty_id: randomUUID(),
    ...over,
  }
}

/**
 * A gas-seed low-balance alert — the fat, resolved shape a CHANNEL renders.
 *
 * Defaults to the state that matters: a wallet with a couple of grants left,
 * which is the warning rather than the outage. Overridable so a suite can push
 * it to zero and check the wording changes.
 */
export function gasSeedLowBalanceAlert(
  over: Partial<AlertOf<'gas-seed.low-balance'>> = {},
): AlertOf<'gas-seed.low-balance'> {
  return {
    kind: 'gas-seed.low-balance',
    chain_id: 'eip155:16602',
    funder_address: '0xB661f0d2ce46Bd787b4Fb5C40c74cF94CCBa8B23',
    balance_raw: '20000000000000000',
    grant_raw: '10000000000000000',
    grants_remaining: 2,
    ...over,
  }
}
