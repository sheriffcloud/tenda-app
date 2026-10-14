/**
 * Fiat-rails tunables (stage-8-fiat-rails.md). Provider API credentials
 * live in server env (config.ts), the fiat_providers.config jsonb only
 * carries non-secret routing hints.
 */
import { P2P_PROVIDER_ID, EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS } from '@tenda/shared'

/** Quote validity window, expired quotes are never honored (§ Risks). */
export const QUOTE_TTL_MS = 10 * 60_000

/**
 * Reconciliation: open intents older than this get a provider.status()
 * poll on each job tick (§ Reconciliation).
 */
export const RECONCILE_MIN_AGE_MS = 5 * 60_000

/** Provider shows no record after this long → mark intent failed. */
export const RECONCILE_GIVE_UP_MS = 24 * 60 * 60_000

/** Batch bound per job tick, keeps the tick O(small) under backlog. */
export const RECONCILE_BATCH_LIMIT = 100

/** p2p_internal spread over the platform mid-rate (bps). */
export const P2P_INTERNAL_SPREAD_BPS = 100

/**
 * Onramp order-book matching tolerance (CO4): exchange escrows are
 * all-or-nothing, so a buyer's fiat amount matches offers within ±10%,
 * the quote then reflects the OFFER's exact terms.
 */
export const P2P_ONRAMP_MATCH_TOLERANCE_BPS = 1_000

/** The always-available fallback provider id (§ Provider routing). */
export const P2P_INTERNAL_ID = P2P_PROVIDER_ID

/**
 * Quote-routing fallback when the user has no stored country, Nigeria is
 * the launch market (stage-8 § Scope).
 */
export const DEFAULT_FIAT_COUNTRY = 'NG'

/**
 * Payment window stamped on p2p_internal exchange escrows (how long the
 * counterparty has to pay fiat after accepting). Single-sourced from the
 * shared exchange default so the manual-create and offramp paths never drift.
 */
export const P2P_INTERNAL_PAYMENT_WINDOW_SECONDS = EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS
