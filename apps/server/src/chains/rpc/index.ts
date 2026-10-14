/**
 * The central RPC seam: where every chain client in this server is built, and
 * the one place failover policy lives.
 *
 * A feature that needs to talk to a chain asks HERE. It does not construct a
 * `Connection`, and it does not build a viem transport — a source-scan test
 * fails the build if it does. That rule exists because the alternative was
 * measured: five Solana construction sites, three different failover policies,
 * and a low-balance monitor that went blind on a chain whose fallback was
 * configured and quietly ignored.
 *
 * Removal recipe: this module has no feature knowledge, so it is deletable only
 * by inlining it back into every caller — which is the state it replaced.
 */

// `hasDistinctFallback` and `rpcEndpoints` are deliberately NOT re-exported:
// they are the seam's own building blocks, used by ./solana and ./evm, and
// nothing outside needs them. A barrel that advertises more than anyone imports
// is how a module's real surface stops being legible — add a line here the day
// a caller appears, not before.
export { distinctFallbackUrl } from './endpoints'
export { withRpcFallback } from './call'
export {
  DEFAULT_RPC_TIMEOUT_MS,
  FALLBACK_RPC_TIMEOUT_MS,
  commitmentFor,
  perEndpointTimeoutMs,
  solanaConnectionConfig,
  solanaConnections,
} from './solana'
// The EVM timeout constants are NOT re-exported, for the reason given above:
// `evmTransport` applies them itself and nothing outside the seam reads them.
// Their Solana counterparts ARE listed, because a suite genuinely imports those.
export { evmTransport } from './evm'
