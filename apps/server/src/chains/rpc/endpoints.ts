/**
 * WHICH endpoints a chain client may talk to, and in what order.
 *
 * One rule, both namespaces. It began inside chains/solana/rpc, which was fine
 * while Solana was the only failover; then the EVM hot wallet wanted the same
 * predicate, then the gas-seed funder hand-rolled a third copy. A rule about
 * URLs is not a rule about a chain family, so it lives here and everyone reads
 * it from here.
 */

/**
 * The fallback URL, or undefined when there is none worth failing over to.
 *
 * A fallback that DUPLICATES the primary is no failover at all — retrying the
 * endpoint that just failed buys nothing but latency — so it is dropped here
 * rather than at each call site. Not hypothetical: 0G Galileo's deployment had
 * its primary copied into the fallback var, and without this it would have got
 * a transport that only pretended to be redundant.
 */
export function distinctFallbackUrl(args: {
  rpc_url: string
  rpc_url_fallback?: string
}): string | undefined {
  return args.rpc_url_fallback !== undefined && args.rpc_url_fallback !== args.rpc_url
    ? args.rpc_url_fallback
    : undefined
}

/** Whether a chain has a second endpoint worth trying. */
export function hasDistinctFallback(args: { rpc_url: string; rpc_url_fallback?: string }): boolean {
  return distinctFallbackUrl(args) !== undefined
}

/**
 * The endpoints to try, primary first — one entry, or two when a distinct
 * fallback is configured.
 *
 * Non-empty by TYPE, so a caller can index `[0]` for the deliberate
 * single-endpoint cases (an encode-only client, a send that must not be
 * retried elsewhere) without a null check that would only ever be dead code.
 */
export function rpcEndpoints(args: {
  rpc_url: string
  rpc_url_fallback?: string
}): readonly [string, ...string[]] {
  const fallback = distinctFallbackUrl(args)
  return fallback === undefined ? [args.rpc_url] : [args.rpc_url, fallback]
}
