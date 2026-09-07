/**
 * Restriction tier table (stage-7-reputation.md § Restriction tiers).
 * Thresholds read the on-the-fly windowed counts, never denormalized
 * columns. Cooldowns are absolute timestamps, no decay job.
 *
 * Serial-disputer deterrence is the dispute_cooldown (locked decision #17
 * + stage-7 body); the contract's bond stays fixed at create time.
 */

import type { RestrictionKind, StandingEventKind } from '@tenda/shared/db/schema/reputation'

export interface RestrictionTier {
  /** Windowed signal the tier counts. */
  signal: Extract<StandingEventKind, 'abandoned' | 'ghosted_approval' | 'disputed_lost'>
  /** Window the count is computed over. */
  window_days: number
  /** Count at or above which the tier applies. */
  threshold: number
  kind: Exclude<RestrictionKind, 'manual_review'>
  duration_days: number
  reason: string
}

/**
 * Ordered loosest → strictest per kind; evaluation picks the strictest
 * matching tier (longest duration wins).
 */
export const RESTRICTION_TIERS: ReadonlyArray<RestrictionTier> = [
  {
    signal: 'abandoned',
    window_days: 30,
    threshold: 3,
    kind: 'accept_cooldown',
    duration_days: 7,
    reason: '3 abandoned escrows in 30 days',
  },
  {
    signal: 'abandoned',
    window_days: 30,
    threshold: 5,
    kind: 'accept_cooldown',
    duration_days: 30,
    reason: '5 abandoned escrows in 30 days',
  },
  {
    signal: 'ghosted_approval',
    window_days: 30,
    threshold: 3,
    kind: 'create_cooldown',
    duration_days: 7,
    reason: '3 ghosted approvals in 30 days',
  },
  {
    signal: 'ghosted_approval',
    window_days: 30,
    threshold: 5,
    kind: 'create_cooldown',
    duration_days: 30,
    reason: '5 ghosted approvals in 30 days',
  },
  {
    signal: 'disputed_lost',
    window_days: 90,
    threshold: 3,
    kind: 'dispute_cooldown',
    duration_days: 14,
    reason: '3 disputes lost in 90 days',
  },
  {
    signal: 'disputed_lost',
    window_days: 90,
    threshold: 5,
    kind: 'dispute_cooldown',
    duration_days: 60,
    reason: '5 disputes lost in 90 days',
  },
]

/** fraud_confirmed ≥ 1 → manual_review (no expiry; admin lifts). */
export const FRAUD_RESTRICTION_REASON = 'fraud confirmed, account under review'

/** Below this many outcomes the public completion_rate is null ("New user"). */
export const COLD_START_MIN_OUTCOMES = 3

// ── #82 fraud FLAG (admin-only signal, never an automatic restriction) ────

/** Dispute rate strictly above this (in basis points) raises the flag. */
export const DISPUTE_RATE_FLAG_THRESHOLD_BPS = 3000

/** Below this many closed two-party engagements the flag never raises. */
export const DISPUTE_RATE_MIN_ENGAGEMENTS = 5

/** Restriction kinds visible to OTHER users as "limited account". */
export const PUBLICLY_VISIBLE_KINDS: ReadonlyArray<RestrictionKind> = [
  'accept_cooldown',
  'create_cooldown',
  'manual_review',
]
