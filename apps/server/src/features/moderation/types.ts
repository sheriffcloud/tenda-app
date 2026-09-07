/**
 * Moderation contracts (stage-6-moderation.md § Provider interface).
 *
 * Providers return `null` for "inconclusive, try the next provider in the
 * pipeline"; a Verdict is decisive and stops the pipeline.
 */

import type { ModerationDecision } from '@tenda/shared/db/schema/moderation'

export interface ModerationInput {
  title: string
  description: string
  category: string
  country: string
  /** Asset registry id, e.g. 'USDC_SOL'. */
  asset: string
  amount_raw: string
  /** Asset decimals, converts amount_raw to display units for price sanity. */
  asset_decimals: number
}

export interface VerdictReason {
  /** Machine code, e.g. 'CONTENT_VIOLENCE', 'PRICE_TOO_LOW'. */
  code: string
  /** User-facing message. */
  message: string
  severity: 'info' | 'warn' | 'critical'
}

export interface Verdict {
  decision: ModerationDecision
  reasons: VerdictReason[]
  provider: 'keyword' | 'claude' | 'openai' | 'admin'
  model?: string
  cached: boolean
}

/**
 * Percentiles in RAW units of the row's asset (numeric(78,0) columns),
 * outlier checks compare raw-to-raw with integer math; only the LLM
 * prompt converts to display units (via the input's asset_decimals).
 */
export interface PriceStats {
  p10_raw: string
  p50_raw: string
  p90_raw: string
  sample_size: number
}

export interface ModerationProvider {
  name: Verdict['provider']
  /** Null = inconclusive, fall through to the next provider. */
  contentSafety?(input: ModerationInput): Promise<Verdict | null>
  priceSanity?(input: ModerationInput, stats: PriceStats): Promise<Verdict | null>
}
