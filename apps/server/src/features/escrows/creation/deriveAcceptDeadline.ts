/**
 * The accept deadline a create transaction should encode, for a draft that
 * already exists. ONE rule, because two paths build from a stored row —
 * `prepareDraftCreate` (build-create and relayed funding) and the replay branch
 * of POST /v1/escrows — and a draft must not get a different answer depending
 * on which door it came through.
 *
 * Two forces, pulling opposite ways (#41):
 *
 *   staleness  a draft may sit for days, and both programs reject a create
 *              whose accept window has already closed (Solana
 *              `require!(accept_deadline > now)`, EVM reverts on
 *              `<= block.timestamp`). A lapsed instant must be redrawn, or the
 *              caller pays gas for a transaction that cannot succeed.
 *   the NONCE  the agent one-shot signs an EIP-3009 authorization whose nonce
 *              is keccak256 of the create params, and `acceptDeadline` is one
 *              of them. The 402 quote and the X-PAYMENT resend both build, so
 *              re-deriving on each gives two different nonces the moment the
 *              pair crosses a one-second boundary, and the relay then refuses
 *              the agent's own signature.
 *
 * Reusing the stored instant while it outlives a quote satisfies both: a quote
 * and its payment agree for the whole quote lifetime, and a window that has
 * actually run down still gets a fresh one. The margin is
 * RELAY_QUOTE_TTL_SECONDS rather than an invented number, because that is
 * exactly how long a signed quote may still arrive.
 *
 * `MIN_ACCEPT_WINDOW_SECONDS > RELAY_QUOTE_TTL_SECONDS` is what keeps the reuse
 * branch reachable at all — guarded by a test, not by assumption.
 */
import { RELAY_QUOTE_TTL_SECONDS } from '@tenda/shared'

export interface DraftAcceptWindow {
  /** What the row holds now — null for drafts opened before the column existed. */
  accept_deadline: Date | null
  /** The caller-authored duration, never rewritten. */
  accept_window_seconds: number
}

export function deriveAcceptDeadline(draft: DraftAcceptWindow, now: Date): Date {
  const stored = draft.accept_deadline
  const quote_horizon_ms = now.getTime() + RELAY_QUOTE_TTL_SECONDS * 1000
  if (stored !== null && stored.getTime() > quote_horizon_ms) return stored
  return new Date(now.getTime() + draft.accept_window_seconds * 1000)
}

/**
 * Whether a derived deadline differs from what the row already holds — the test
 * both build paths gate their re-stamp on. BY VALUE, because the derivation
 * returns the stored object itself when it reuses it and a fresh one when it
 * redraws, so identity would answer correctly today for the wrong reason. A
 * null stored instant always counts as moved: the row is missing the fact.
 */
export function acceptDeadlineMoved(stored: Date | null, derived: Date): boolean {
  return stored === null || stored.getTime() !== derived.getTime()
}
