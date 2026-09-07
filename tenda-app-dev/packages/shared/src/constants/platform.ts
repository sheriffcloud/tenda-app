/**
 * Platform-config defaults — the single source for the `platform_config`
 * column defaults AND the server's no-row fallback.
 *
 * These lived in two places before: `.default(...)` in the schema and a
 * hand-written object in `lib/platform.ts`, which could disagree silently on
 * a freshly-seeded database. Declaring them once means a new tunable is one
 * edit, and the fallback can never drift from the column.
 *
 * Values are the operational defaults, not limits: every one is admin-editable
 * at runtime through the singleton row.
 */

export const PLATFORM_CONFIG_DEFAULTS = {
  fee_bps: 250,
  seeker_fee_bps: 100,
  grace_period_seconds: 3_600,
  approval_window_seconds: 172_800,
  default_sponsored_tx_count: 3,
  moderation_rules_version: 1,
  /**
   * Gigs one worker may hold at once. Counts live obligations only — see
   * `features/capacity` for exactly which escrows consume a slot.
   */
  max_pending_gigs: 2,
  /**
   * Seconds after an approval-mode assignment during which the poster may
   * still `unassign`. Stamped onto each escrow AT CREATE and enforced
   * on-chain, so changing it here only affects gigs posted afterwards —
   * never a live assignment. Bounded by ESCROW_LIMITS.maxUnassignWindowSeconds
   * (the bound both contracts enforce).
   */
  unassign_window_seconds: 6 * 60 * 60,
  /** Open applications one worker may hold at once (spam control). */
  max_open_applications: 5,
  /**
   * How long an application stays assignable. Long enough to be practical,
   * short enough that "unexpired" still means the applicant is likely free —
   * the D5 copy leans on that, since a stale application can still be assigned.
   */
  application_ttl_seconds: 24 * 60 * 60,
} as const

/**
 * Upper bound accepted for `max_pending_gigs`, mirrored by a CHECK on the
 * column. Generous on purpose: the cap is a guardrail against over-committing,
 * not a throttle, and operators may want it effectively off while the market
 * is thin.
 */
export const MAX_PENDING_GIGS_CEILING = 100
