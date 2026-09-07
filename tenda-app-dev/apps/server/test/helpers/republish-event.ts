/**
 * The `EscrowRepublishEvent` fixture — what verify-tx hands the fan-out.
 *
 * Three suites had grown their own builder for this (the processor fan-out
 * tests, the alert producer's, and the fan-out hook's), which is two too many
 * for a shape that is a shared contract: a field added to
 * `EscrowRepublishEvent` should reach every fixture at once, not the two whose
 * authors remembered.
 *
 * Built from the WIRE event and translated the way verify-tx builds the real
 * one, so `wire_event` and `internal_event` cannot disagree. Taking the
 * internal name and letting the caller name a wire event separately would let a
 * fixture claim `escrow.approved` arrived as `DisputeRaised` — harmless while
 * nothing reads the field, and a false premise the moment something does.
 */
import { randomUUID } from 'node:crypto'
import { INTERNAL_EVENT_BY_WIRE, type EscrowRepublishEvent } from '@server/lib/escrow-events'
import type { EscrowEvent } from '@server/chains/types'

/**
 * The fields a caller may set. The two DERIVED ones are excluded rather than
 * merely defaulted, and that is what makes the note above true instead of
 * aspirational: `over` used to be a plain `Partial<EscrowRepublishEvent>`, which
 * includes both and is spread last, so any caller could have set them
 * independently and produced exactly the mismatched fixture the note says is
 * impossible. A comment that the types do not enforce is a comment waiting to
 * be wrong.
 */
type RepublishOverrides = Partial<Omit<EscrowRepublishEvent, 'internal_event' | 'wire_event'>>

/**
 * Ids default to fresh random values rather than a fixed literal: a suite that
 * enqueues two events expects two distinct subjects, and shared constants make
 * "the builder ignored its argument" indistinguishable from "it used it".
 */
export function republishEvent(
  wire_event: EscrowEvent,
  over: RepublishOverrides = {},
): EscrowRepublishEvent {
  return {
    internal_event: INTERNAL_EVENT_BY_WIRE[wire_event],
    escrow_id: randomUUID(),
    wire_event,
    tx_ref: `sig-${randomUUID()}`,
    counterparty_id: null,
    passed_applicant_ids: [],
    revived_applicant_ids: [],
    ...over,
  }
}
