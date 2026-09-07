/**
 * Live-refresh tuning for an escrow that is on screen.
 *
 * A leaf module on purpose — the timer tests import these names directly so a
 * test can never drift from the tuning it is asserting. That was the stated
 * intent of the two per-client copies this replaces, and it was the one thing
 * they could not deliver: being duplicated per client, they could drift from
 * each other, which is the drift that actually matters when the two apps are
 * meant to poll the same escrow at the same rate.
 */

/** Collapse a burst of escrow events into one refresh. */
export const ESCROW_EVENT_DEBOUNCE_MS = 400

/** How often a FOCUSED escrow re-reads itself when nothing else has poked it. */
export const ESCROW_FOCUSED_POLL_MS = 15_000
