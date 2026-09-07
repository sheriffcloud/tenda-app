/**
 * Self-hosted EVM polling listener, the counterpart of the Solana one
 * (chains/solana/listener-polling) and the fix for the client-ping being the
 * ONLY EVM verification intake: a wallet that broadcasts but never reports
 * (lost WalletConnect response, killed app) previously left the DB diverged
 * from the chain forever. Runs for every configured EVM chain without a
 * webhook secret; enqueued jobs land in the same idempotent verify-tx
 * pipeline (escrow_transactions dedup + status-guarded apply), so replays
 * and client-ping overlaps are harmless.
 *
 * TWO cursors, live and history — see ./tick.ts for why and how. The
 * confirmation lag keeps enqueued hashes past the adapter's depth check (fewer
 * retry loops) and out of shallow reorgs; reverted txs emit no logs, so only
 * real state changes surface — failed txs stay covered by the client-ping +
 * reconcile path.
 *
 * This module is the POLICY only: the numbers, and what each one is bounded by.
 */

// ---------- policy constants ---------------------------------------------

/** Same cadence as the Solana listener; block time never beats it usefully. */
export const EVM_POLL_INTERVAL_MS = 15_000

/**
 * Per-endpoint RPC timeout for the listener's OWN client. The default
 * createEvmRpc budgets (6s per endpoint with a fallback) are tuned for the
 * interactive tx-build path; a background poller has no user waiting, and on
 * a high-latency link a 6s cap makes heavier eth_getLogs calls fail
 * spuriously (observed: ~4s for a bare eth_blockNumber). Failures only cost
 * a retried tick, but a generous cap keeps them rare.
 */
export const EVM_LISTENER_RPC_TIMEOUT_MS = 30_000

/**
 * Blocks per eth_getLogs call: the lowest cap among the providers we target.
 * Alchemy's FREE tier rejects ranges over 10 blocks (verified live,
 * -32600 "up to a 10 block range" on Base Sepolia) — larger ranges silently
 * shunted every call onto the fallback endpoint, making the fallback the
 * de-facto primary. Steady state produces ~8 Base blocks per 15s tick, so
 * one call usually covers it; raise this only alongside a paid tier.
 */
export const EVM_GETLOGS_MAX_RANGE = 10n

/**
 * Ranges per tick: the WHOLE tick's RPC budget, shared by the live scan and
 * the history walk (#35) — the live scan takes what it needs to stay current
 * and history gets the remainder, so this number is also the ceiling on calls
 * per tick. 20 × 10 blocks = 200 blocks/tick, ~25× Base's production rate.
 * Raising it means more eth_getLogs per tick against a free-tier rate limit;
 * it is not the lever for catch-up speed, ordering is.
 */
export const EVM_MAX_RANGES_PER_TICK = 20

/**
 * First-run lookback when the chain's ESCROW_DEPLOY_BLOCK secret is unset
 * (the deploy block is the exact start — no event can predate the contract).
 * 200k blocks ≈ 4½ days on a 2s-block L2 (Base): a bounded recency net, but
 * anything older stays unscanned, hence the boot warning when relying on it.
 */
export const EVM_BACKFILL_BLOCKS = 200_000n

/**
 * How far behind head the LIVE cursor may fall before each tick says so.
 *
 * Generous on purpose: one tick's worth of blocks is normal, and a warning that
 * fires in normal operation is one nobody reads. 1,000 blocks is several ticks
 * behind on any chain here — by then the listener is genuinely not keeping up
 * and the app is serving stale escrow state, which is the condition #35 exists
 * to make visible instead of leaving it to be discovered from a stuck gig.
 */
export const EVM_LIVE_LAG_WARN_BLOCKS = 1_000
