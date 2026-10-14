/**
 * Per-endpoint timeout budgets. Two of them, both raised above the global
 * `apiConfig[env].timeout` because the SERVER is slow on purpose for those
 * calls — a client that gives up first surfaces a raw "Aborted" and the wallet
 * never opens.
 */

/**
 * Endpoints that synchronously run the moderation LLM.
 *
 * The server's worst case is two OpenRouter calls (content + low-confidence
 * escalation) at `moderationConfig.timeoutMs` each; this must sit above that
 * plus network overhead, well clear of the global 5s dev default that
 * otherwise aborts gig creation mid-moderation. Keep in sync with the server
 * moderation budget.
 */
export const MODERATION_TIMEOUT_MS = 20_000

/**
 * Tx-build endpoints that make live EVM RPC reads server-side: dispute
 * (readEscrow) and permit-payload (name/nonces/DOMAIN_SEPARATOR). The server's
 * viem transport waits up to 15s per RPC attempt (DEFAULT_EVM_RPC_TIMEOUT_MS),
 * so the global dev default aborts while the server is still waiting on a slow
 * RPC. Keep above the server RPC timeout.
 */
export const TX_BUILD_TIMEOUT_MS = 20_000

/** Draft creation also builds a chain transaction before responding. */
export const ESCROW_CREATE_TIMEOUT_MS = 20_000

/** Proof persistence can wait behind the escrow-scoped concurrency lock. */
export const PROOF_PERSISTENCE_TIMEOUT_MS = 20_000
