/**
 * Live-refresh tuning for a LIST that is on screen — the public gig feed, the
 * signed-in open-gigs column, My Gigs, My Disputes.
 *
 * A leaf module beside `escrow-live.ts`, for the reason that file gives: a
 * cadence duplicated per client drifts, and two apps meant to feel equally
 * live must not disagree about how live that is. These began as a web-local
 * copy and were moved here before mobile grew the same wiring — which is the
 * moment the drift would have started rather than the moment it was noticed.
 *
 * Deliberately NOT reusing the `ESCROW_*` names even though the values match
 * today: those pace one escrow detail screen re-reading itself, these pace
 * list membership. Tuning one should not silently retune the other, and the
 * matching values are agreement rather than a shared definition.
 */

/**
 * How long to wait before asking the server again after a change the client
 * could not resolve alone.
 *
 * One notification is often a fan-out of several and one gig transition can
 * publish more than one frame, so the trailing edge collapses a burst into a
 * single round trip — long enough to catch the burst, short enough to read as
 * live.
 */
export const LIST_BURST_DEBOUNCE_MS = 400

/**
 * How often a visible list re-reads itself while it has no socket at all.
 *
 * Every anonymous visitor lives here — they never get one — so this is a floor
 * on how stale the public feed can be, not only a failure path.
 */
export const LIST_OFFLINE_POLL_MS = 15_000
