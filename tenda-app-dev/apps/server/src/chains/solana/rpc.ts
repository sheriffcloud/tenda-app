/**
 * Thin RPC seam for the Solana adapter.
 *
 * `SolanaRpc` is the complete network surface the adapter touches, builders
 * and verifiers depend on this interface, never on `Connection` directly, so
 * adapter tests run fully offline against a fake (testing-strategy.md:
 * "no real network in unit / route tests").
 */

import { Connection, PublicKey, type Commitment, type ConnectionConfig } from '@solana/web3.js'
import { withTimeout } from '@tenda/shared'
import type { ChainId } from '@server/chains/types'

/** Minimal decoded view of a fetched transaction. */
export interface SolanaTxResult {
  /** Whether the runtime recorded an execution error. */
  failed: boolean
  /** Stringified runtime error when `failed`; null otherwise. */
  failure_reason: string | null
  /** Program log messages (event payloads decode from these). */
  log_messages: string[]
}

export interface SolanaRpc {
  getLatestBlockhash(): Promise<{ blockhash: string; last_valid_block_height: number }>
  /** Null = signature unknown / not yet confirmed at the required commitment. */
  getTransaction(tx_ref: string): Promise<SolanaTxResult | null>
  /**
   * Raw account data plus its OWNING program. Null = account does not exist.
   *
   * The owner rides along because Anchor's account discriminator is derived
   * from the account NAME, so it is identical across program generations: an
   * account left behind by a superseded program deserialises perfectly as
   * current state. Data alone cannot tell the two apart; only the owner can.
   */
  getAccount(address: string): Promise<{ data: Buffer; owner: string } | null>
  /**
   * Recent signatures touching an address (newest first), the polling
   * listener's feed. Failed txs are included; verify-tx classifies them.
   */
  getSignaturesForAddress(
    address: string,
    opts: { limit: number },
  ): Promise<Array<{ signature: string; slot: number }>>
}

/** Default per-call timeout. Override via `createSolanaRpc` args. */
export const DEFAULT_RPC_TIMEOUT_MS = 15_000

/**
 * Per-endpoint attempt timeout when a fallback RPC is configured. Failover IS
 * the retry (two independent providers beat re-hitting a degraded one), so
 * each endpoint gets one bounded attempt: worst case 2 × 6s = 12s, inside the
 * mobile client's 20s tx-build budget — a rate-limited or dead primary
 * degrades to ~6s + fallback latency instead of an aborted request. Mirrors
 * FALLBACK_EVM_RPC_TIMEOUT_MS (chains/evm/rpc).
 */
export const FALLBACK_RPC_TIMEOUT_MS = 6_000

/**
 * The fallback URL, or undefined when there is none worth failing over to —
 * a fallback that duplicates the primary is no failover at all. Single source
 * for the predicate the timeout policy, the connection config and the factory
 * branch all share.
 */
export function distinctFallbackUrl(args: {
  rpc_url: string
  rpc_url_fallback?: string
}): string | undefined {
  return args.rpc_url_fallback !== undefined && args.rpc_url_fallback !== args.rpc_url
    ? args.rpc_url_fallback
    : undefined
}

/**
 * Per-endpoint budget: an explicit override wins; otherwise tight when a
 * DISTINCT fallback exists (failover is the retry policy), relaxed when the
 * endpoint stands alone.
 */
export function perEndpointTimeoutMs(args: {
  timeout_ms?: number
  rpc_url: string
  rpc_url_fallback?: string
}): number {
  if (args.timeout_ms !== undefined) return args.timeout_ms
  return distinctFallbackUrl(args) !== undefined
    ? FALLBACK_RPC_TIMEOUT_MS
    : DEFAULT_RPC_TIMEOUT_MS
}

/**
 * Commitment policy (recorded decision): devnet accepts `'confirmed'`,
 * mainnet requires `'finalized'`.
 */
export function commitmentFor(chain_id: ChainId): Commitment {
  return chain_id === 'solana:devnet' ? 'confirmed' : 'finalized'
}

/**
 * Connection config for every endpoint this factory builds. web3.js's default
 * 429 handling retries up to 5 attempts with exponential backoff (0.5/1/2/4s
 * of sleep ≈ 7.5s, plus five round-trips), which starves `failoverSolanaRpc`:
 * the primary burns most or all of its per-call timeout before the fallback is
 * ever tried. With a fallback, a 429 must
 * surface immediately so failover engages in one round-trip — failover is the
 * retry policy. WITHOUT one, the built-in backoff stays on: it is the only
 * recovery a lone endpoint has for a transient burst limit. Same conditional
 * decision the EVM adapter records (`retryCount: 0` only in its fallback
 * branch).
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
 * Minimal `Connection` surface the wrapper consumes. Tests inject a fake
 * against this port (no web3 Connection, no network); `createSolanaRpc`
 * builds the real Connection, owning commitment + PublicKey construction,
 * and adapts it here.
 */
export interface SolanaConnectionPort {
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>
  getTransaction(
    tx_ref: string,
  ): Promise<{ meta: { err: unknown; logMessages?: string[] | null } | null } | null>
  getAccountInfo(address: string): Promise<{ data: Buffer; owner: string } | null>
  getSignaturesForAddress(
    address: string,
    opts: { limit: number },
  ): Promise<Array<{ signature: string; slot: number }>>
}

/**
 * The per-call budget every Solana network call runs under — the adapter's
 * reads here AND the relayer's reads/writes (relay/relayer.ts): web3's
 * `Connection` has no timeout of its own, so without this a hung endpoint
 * hangs the request.
 */
export function withSolanaRpcTimeout<T>(
  label: string,
  operation: Promise<T>,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
): Promise<T> {
  return withTimeout(operation, timeoutMs, `solana rpc timeout after ${timeoutMs}ms: ${label}`)
}

/**
 * Wrap a connection port into the SolanaRpc the adapter consumes, the
 * testable unit: the per-call timeout race plus response→interface mapping.
 */
export function solanaRpcFromConnection(
  conn: SolanaConnectionPort,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
): SolanaRpc {
  const withRpcTimeout = <T>(label: string, operation: Promise<T>): Promise<T> =>
    withSolanaRpcTimeout(label, operation, timeoutMs)

  return {
    async getLatestBlockhash() {
      const r = await withRpcTimeout('getLatestBlockhash', conn.getLatestBlockhash())
      return { blockhash: r.blockhash, last_valid_block_height: r.lastValidBlockHeight }
    },

    async getTransaction(tx_ref) {
      const tx = await withRpcTimeout(`getTransaction(${tx_ref})`, conn.getTransaction(tx_ref))
      if (tx === null) return null
      const err = tx.meta?.err ?? null
      return {
        failed: err !== null,
        failure_reason: err === null ? null : JSON.stringify(err),
        log_messages: tx.meta?.logMessages ?? [],
      }
    },

    async getAccount(address) {
      const info = await withRpcTimeout(`getAccountInfo(${address})`, conn.getAccountInfo(address))
      return info === null ? null : { data: Buffer.from(info.data), owner: info.owner }
    },

    async getSignaturesForAddress(address, opts) {
      const infos = await withRpcTimeout(
        `getSignaturesForAddress(${address})`,
        conn.getSignaturesForAddress(address, { limit: opts.limit }),
      )
      return infos.map((i) => ({ signature: i.signature, slot: i.slot }))
    },
  }
}

export function createSolanaRpc(args: {
  rpc_url: string
  rpc_url_fallback?: string
  chain_id: ChainId
  timeout_ms?: number
}): SolanaRpc {
  const commitment = commitmentFor(args.chain_id)
  const fallback_url = distinctFallbackUrl(args)
  const connection_config = solanaConnectionConfig({
    chain_id: args.chain_id,
    has_fallback: fallback_url !== undefined,
  })
  const buildPort = (rpcUrl: string): SolanaConnectionPort => {
    const connection = new Connection(rpcUrl, connection_config)
    return {
      getLatestBlockhash: () => connection.getLatestBlockhash(commitment),
      getTransaction: (tx_ref) =>
        connection.getTransaction(tx_ref, {
          maxSupportedTransactionVersion: 0,
          commitment: commitment === 'confirmed' ? 'confirmed' : 'finalized',
        }),
      // web3.js hands back `owner` as a PublicKey; the port speaks base58 so the
      // seam stays comparable to IDL/config addresses without importing web3.
      getAccountInfo: async (address) => {
        const info = await connection.getAccountInfo(new PublicKey(address), commitment)
        return info === null ? null : { data: info.data, owner: info.owner.toBase58() }
      },
      getSignaturesForAddress: (address, opts) =>
        connection.getSignaturesForAddress(new PublicKey(address), { limit: opts.limit }),
    }
  }
  const timeout_ms = perEndpointTimeoutMs(args)
  const primary = solanaRpcFromConnection(buildPort(args.rpc_url), timeout_ms)
  if (fallback_url === undefined) return primary
  const secondary = solanaRpcFromConnection(buildPort(fallback_url), timeout_ms)
  return failoverSolanaRpc(primary, secondary)
}

/** Fail over each independent read; callers retain the same protocol-specific interface. */
export function failoverSolanaRpc(primary: SolanaRpc, secondary: SolanaRpc): SolanaRpc {
  const attempt = async <T>(first: () => Promise<T>, fallback: () => Promise<T>): Promise<T> => {
    try {
      return await first()
    } catch {
      return fallback()
    }
  }
  return {
    getLatestBlockhash: () => attempt(primary.getLatestBlockhash, secondary.getLatestBlockhash),
    getTransaction: (ref) => attempt(() => primary.getTransaction(ref), () => secondary.getTransaction(ref)),
    getAccount: (address) => attempt(() => primary.getAccount(address), () => secondary.getAccount(address)),
    getSignaturesForAddress: (address, opts) => attempt(
      () => primary.getSignaturesForAddress(address, opts),
      () => secondary.getSignaturesForAddress(address, opts),
    ),
  }
}
