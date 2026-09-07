/**
 * Fiat-rails public surface (stage-8-fiat-rails.md). Routes/webhooks/jobs
 * import from HERE, never from the module internals (exit criterion: single
 * import surface). Live DI assembly is in ./live-deps; the P2P drizzle wiring
 * it composes is in ./p2p-live; the quote/initiate/settle service is ./service.
 */

export { requestQuote, initiateIntent, cancelIntent, settleFromProvider, reconcileIntent } from './service'
export type { QuoteInput, QuoteResult, InitiateOutput, FiatDeps, FiatEvent } from './service'
export { drizzleFiatStore, drizzleBankAccountStore, OPEN_STATUSES } from './store'
export type { FiatStore, BankAccountStore, BankAccountRow } from './store'
export { redisQuoteCache, inMemoryQuoteCache, quoteKey } from './quote-cache'
export type { QuoteCache, StoredQuote } from './quote-cache'
export { pickCandidates, supportsRequest } from './routing'
export type { ProviderRegistryRow } from './routing'
// Named rather than `export *`: `export type` marks what is erased and
// `export` what survives to runtime, and no __exportStar loop is emitted.
export type {
  QuoteRequest,
  ProviderQuote,
  PaymentInstruction,
  DepositInstruction,
  InitiateResult,
  IntentQuoteSnapshot,
  ProviderIntentStatus,
  ProviderCapabilities,
  ProviderStatusContext,
  FiatProvider,
  BankAccountRef,
  FiatIntentRow,
  // Re-exported BY ./types from the shared schema, so the barrel has to name
  // them too — `export *` used to carry them along invisibly.
  FiatDirection,
  FiatIntentStatus,
} from './types'
export { QUOTE_TTL_MS, P2P_INTERNAL_ID } from './config'
export { P2P_INTERNAL_CAPABILITIES, EXCHANGE_ASSET_IDS } from './capabilities'
export { YELLOWCARD_SPEC, ONRAMPMONEY_SPEC } from './providers/specs'
export { buildProviders, buildFiatDeps } from './live-deps'
