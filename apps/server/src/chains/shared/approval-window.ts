/**
 * The review window's read-through cache (#148): one per adapter, over the
 * chain's own read of the contract value.
 *
 * TTL rather than boot-only, because the multisig `setApprovalWindow` changes
 * the number without a redeploy and the registry should follow within
 * minutes. STALE-WHILE-ERROR rather than fail, because the registry is
 * mobile's bootstrap: a single RPC hiccup must not turn every chain's entry
 * into a 500. A read that has NEVER succeeded still throws — the registry
 * route turns that into "chain omitted, error logged", the signal that this
 * deployment cannot read its own contract.
 */

/** Long enough to spare the RPC on every registry read, short enough to follow an admin change. */
export const APPROVAL_WINDOW_TTL_MS = 5 * 60 * 1000

export function cachedApprovalWindow(
  read: () => Promise<number>,
  now: () => number = Date.now,
  ttl_ms: number = APPROVAL_WINDOW_TTL_MS,
): () => Promise<number> {
  let value: number | null = null
  let fresh_until = 0
  return async () => {
    if (value !== null && now() < fresh_until) return value
    try {
      value = await read()
      fresh_until = now() + ttl_ms
      return value
    } catch (err) {
      if (value !== null) return value
      throw err
    }
  }
}
