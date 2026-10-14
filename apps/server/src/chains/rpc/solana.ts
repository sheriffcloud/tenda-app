/**
 * THE Solana connection factory. Every `Connection` this server builds comes
 * from here.
 *
 * That is the whole point, and it is enforced by a source scan
 * (test/unit/rpc-central-seam.test.ts) rather than by hoping. Before this,
 * five sites each built their own with three different failover policies: the
 * read seam failed over, the relayer hardcoded `has_fallback: false`, and the
 * gas-seed funder hand-rolled a try/catch. A sixth feature would have picked
 * one at random, which is exactly how the monitor came to be blind on a chain
 * whose fallback was configured and ignored.
 *
 * Returns the CLIENTS, not a wrapped façade. `Connection` has a hundred
 * methods and `sendAndConfirmTransaction` demands a real one, so a façade would
 * either be a permanent game of catch-up or a cast. Callers pair these with
 * `withRpcFallback` for reads; the ones that must NOT fail over take `[0]` and
 * say why.
 */

import { Connection, type Commitment, type ConnectionConfig } from '@solana/web3.js'
import type { ChainId } from '@server/chains/types'
import { hasDistinctFallback, rpcEndpoints } from './endpoints'

/** Default per-call timeout. */
export const DEFAULT_RPC_TIMEOUT_MS = 15_000

/**
 * Per-endpoint attempt timeout when a distinct fallback exists. Failover IS the
 * retry — two independent providers beat re-hitting a degraded one — so each
 * endpoint gets one bounded attempt: worst case 2 × 6s = 12s, inside the mobile
 * client's 20s tx-build budget.
 */
export const FALLBACK_RPC_TIMEOUT_MS = 6_000

/**
 * Commitment policy (recorded decision): devnet accepts `'confirmed'`,
 * mainnet requires `'finalized'`.
 */
export function commitmentFor(chain_id: ChainId): Commitment {
  return chain_id === 'solana:devnet' ? 'confirmed' : 'finalized'
}

/**
 * Per-endpoint budget: an explicit override wins; otherwise tight when a
 * distinct fallback exists, relaxed when the endpoint stands alone.
 */
export function perEndpointTimeoutMs(args: {
  timeout_ms?: number
  rpc_url: string
  rpc_url_fallback?: string
}): number {
  if (args.timeout_ms !== undefined) return args.timeout_ms
  return hasDistinctFallback(args) ? FALLBACK_RPC_TIMEOUT_MS : DEFAULT_RPC_TIMEOUT_MS
}

/**
 * Connection config for every endpoint this factory builds.
 *
 * web3.js's default 429 handling retries up to 5 attempts with exponential
 * backoff (≈7.5s of sleep plus five round-trips), which STARVES failover: the
 * primary burns its whole budget before the fallback is tried. With a fallback,
 * a 429 must surface immediately so failover engages in one round-trip —
 * failover is the retry policy. WITHOUT one, the built-in backoff stays on: it
 * is the only recovery a lone endpoint has.
 */
export function solanaConnectionConfig(args: {
  chain_id: ChainId
  has_fallback: boolean
}): ConnectionConfig {
  return {
    commitment: commitmentFor(args.chain_id),
    disableRetryOnRateLimit: args.has_fallback,
  }
}

/**
 * The Solana clients for one chain, primary first.
 *
 * Non-empty by type. Pair with `withRpcFallback` to make a read failover-capable;
 * take `[0]` only where a second endpoint would be WRONG rather than merely
 * unnecessary, and say so at the call site.
 */
export function solanaConnections(args: {
  chain_id: ChainId
  rpc_url: string
  rpc_url_fallback?: string
}): readonly [Connection, ...Connection[]] {
  const config = solanaConnectionConfig({
    chain_id: args.chain_id,
    has_fallback: hasDistinctFallback(args),
  })
  const [primary, ...rest] = rpcEndpoints(args)
  return [new Connection(primary, config), ...rest.map((url) => new Connection(url, config))]
}
