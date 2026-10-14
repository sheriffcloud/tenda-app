/**
 * THE EVM transport factory. Every viem client this server builds gets its
 * transport from here.
 *
 * EVM needs no `withRpcFallback`: viem's own `fallback` transport does the same
 * job one layer lower, where it can see method-level detail, so the central
 * seam here is the CONSTRUCTION, not the retry loop. Same guarantee either way
 * — a feature cannot end up single-endpoint by forgetting.
 */

import { fallback, http, type Transport } from 'viem'
import { distinctFallbackUrl } from './endpoints'

/** Default per-call timeout for a lone endpoint. */
export const DEFAULT_EVM_RPC_TIMEOUT_MS = 15_000

/**
 * Per-endpoint budget when a distinct fallback exists — failover is the retry,
 * so each endpoint gets one bounded attempt rather than a generous one.
 */
export const FALLBACK_EVM_RPC_TIMEOUT_MS = 6_000

/**
 * A transport over one endpoint, or a failover transport over two.
 *
 * `retryCount: 0` at BOTH levels is deliberate: per-endpoint, because failover
 * is the retry policy and stacking viem's own retries would burn the caller's
 * budget before the second provider is tried; aggregate, because both providers
 * failing once is a real outage that should surface now rather than after
 * another round of delays. `rank` stays off so the primary is always tried
 * first — an operator's primary is their primary.
 *
 * Safe for a WALLET client, not just a reader: the transaction is signed once
 * at a fixed nonce, so re-broadcasting it to the second endpoint is the same
 * transaction with the same hash and the chain de-duplicates it. (Solana has no
 * equivalent guarantee, which is why its seed sender deliberately takes one
 * endpoint — see features/gas-seed/senders/solana.ts.)
 */
export function evmTransport(args: {
  rpc_url: string
  rpc_url_fallback?: string
  timeout_ms?: number
}): Transport {
  const fallback_url = distinctFallbackUrl(args)
  if (fallback_url === undefined) {
    return http(args.rpc_url, { timeout: args.timeout_ms ?? DEFAULT_EVM_RPC_TIMEOUT_MS })
  }
  return fallback(
    [args.rpc_url, fallback_url].map((url) =>
      http(url, { timeout: args.timeout_ms ?? FALLBACK_EVM_RPC_TIMEOUT_MS, retryCount: 0 }),
    ),
    { retryCount: 0 },
  )
}
