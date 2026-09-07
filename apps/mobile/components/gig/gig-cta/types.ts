/** Input/off-chain sheets the gig CTA opens (on-chain moves go via onTxAction). */
export type ActiveSheet = 'proof' | 'addProof' | 'dispute' | 'review' | 'delete'

/**
 * Where a branch sits in the bar, in render order.
 *
 * Slots govern ORDER and EXCLUSIVITY, not styling: a `secondary` branch with
 * no `primary` beside it still renders exactly as it does today. That is what
 * lets the bar stop picking one winning branch without redesigning every
 * screen that only ever had one.
 *
 *  - `notice`    — a message, never a button. At most one.
 *  - `primary`   — the main move. At most one.
 *  - `secondary` — alternatives, sharing one row. At most TWO, asserted by the
 *                  matrix test: three buttons on a row is the congestion this
 *                  layout exists to avoid.
 *
 * How WIDE each of those renders is a separate question, answered by
 * `CtaWidth` in ./slots — the arrangement knows how many share a row, and a
 * slot on its own does not.
 *
 * A tuple with the type DERIVED from it — the same shape as
 * `APPLICATION_STATUSES` and `PROOF_TYPES` — because this tuple is also the
 * order `assignSlots` walks. Written as a separate union, a fourth slot could
 * be added to the type and forgotten in the order, and every branch in it
 * would be silently dropped: exactly the failure this folder exists to end.
 */
export const SLOT_ORDER = ['notice', 'primary', 'secondary'] as const

export type CtaSlot = (typeof SLOT_ORDER)[number]

/** The most buttons that may share the secondary row. */
export const MAX_SECONDARY = 2
