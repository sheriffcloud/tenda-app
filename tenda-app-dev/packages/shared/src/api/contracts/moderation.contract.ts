/**
 * Moderation preview wire contract — POST /v1/moderation/preview
 * (stage-6-moderation.md § Mobile). Dry-run verdict for live UI hints
 * while the user types; the create path re-runs the same pipeline (the
 * server cache makes the final-submit call free for unchanged input).
 */

import type { Endpoint } from '../endpoint'
import type { ModerationDecision } from '../../db/schema/moderation'

export type { ModerationDecision }

export interface ModerationReason {
  /** Machine code, e.g. 'CONTENT_VIOLENCE', 'PRICE_TOO_LOW'. */
  code: string
  /** User-facing message. */
  message: string
  severity: 'info' | 'warn' | 'critical'
}

export interface ModerationPreviewBody {
  title: string
  description: string
  category: string
  country: string
  /** Asset registry id, e.g. 'SOL_DEVNET' or 'USDC_SOL'. */
  asset: string
  /** Canonical raw amount in the asset's smallest unit. */
  amount_raw: string
  asset_decimals: number
}

export interface ModerationPreviewResponse {
  decision: ModerationDecision
  reasons: ModerationReason[]
  cached: boolean
}

export interface ModerationContract {
  preview: Endpoint<'POST', undefined, ModerationPreviewBody, undefined, ModerationPreviewResponse>
}
