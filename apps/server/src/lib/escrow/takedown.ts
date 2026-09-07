/**
 * The CO1 takedown gate: what an escrow with `hidden = true` still permits.
 *
 * Deliberately NOT part of `assertCanTransition`. That module mirrors what the
 * CHAIN would revert — a takedown is a platform decision the contracts know
 * nothing about, it carries its own error code, and folding the two together
 * would make both harder to read. This runs beside it, on the same rows.
 *
 * The policy itself lives in `@tenda/shared` (`TAKEDOWN_POLICY`), because the
 * client reads the same table to stop offering the button. This module owns
 * only the server's half: mapping a state-machine transition onto the shared
 * action vocabulary, and throwing.
 *
 * What it protects, in one line: a hidden listing takes no new participants,
 * and gives up none of its existing ones' exits. Funds may be locked on-chain,
 * so `submit`, `approve`, `cancel`, `refund_*`, `dispute` and `resolve` must
 * survive a takedown — blocking those would strand real money.
 */

import { ErrorCode, isBlockedByTakedown, TAKEDOWN_REFUSED_MESSAGE } from '@tenda/shared'
import type { TakedownAction } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { EscrowTransition } from '@server/lib/escrow/state-machine'

/**
 * State-machine transition → the shared action it is.
 *
 * Almost an identity map, and the two exceptions are the point of writing it
 * out. `publish` is the state machine's name for the act the wire calls
 * `create` (draft → live, one `createEscrow` transaction), and the shared
 * vocabulary is keyed by the wire's names because that is what the client and
 * `escrow_transactions.type` both speak.
 *
 * `satisfies` rather than a plain annotation: a transition added to the state
 * machine becomes a compile error HERE until someone says what a takedown
 * should do about it. That is the whole anti-drift value of this file — the
 * alternative is a `.includes()` on four names that silently answers "allowed"
 * for anything it has not heard of.
 */
const TRANSITION_ACTION = {
  publish:           'create',
  accept:            'accept',
  decline:           'decline',
  assign_accept:     'assign_accept',
  unassign:          'unassign',
  submit:            'submit',
  approve:           'approve',
  claim_stalled:     'claim_stalled',
  cancel:            'cancel',
  refund_expired:    'refund_expired',
  reclaim_abandoned: 'reclaim_abandoned',
  dispute:           'dispute',
  resolve:           'resolve',
} as const satisfies Record<EscrowTransition, TakedownAction>

export function takedownActionFor(transition: EscrowTransition): TakedownAction {
  return TRANSITION_ACTION[transition]
}

/**
 * Refuse an entry action on a taken-down escrow. No-op on a visible one, and
 * no-op for every exit action whatever the visibility.
 *
 * 409 rather than 404: the caller is holding an id they were legitimately
 * served a moment ago (their screen went stale mid-session), so "not found"
 * reads as a bug and teaches them nothing. A refusal that names the reason is
 * what lets the client surface it and re-sync.
 *
 * Takes the one column it reads rather than a named row type — every caller
 * already holds the full escrow row and passes it structurally.
 */
export function assertNotTakenDown(
  escrow: { hidden: boolean },
  action: TakedownAction,
): void {
  if (!escrow.hidden) return
  if (!isBlockedByTakedown(action)) return
  throw new AppError(409, ErrorCode.ESCROW_TAKEN_DOWN, TAKEDOWN_REFUSED_MESSAGE)
}
