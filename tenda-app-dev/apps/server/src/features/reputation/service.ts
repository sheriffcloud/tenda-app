/**
 * Reputation service: apply standing events, evaluate restriction tiers on
 * the fly, and answer the standing/eligibility questions the guards and
 * routes ask.
 *
 * Tier evaluation reads windowed counts from `standing_events` (never
 * denormalized), applies the strictest matching tier, and reports
 * `restricted` ONLY on threshold crossings, recalculations that keep an
 * existing restriction do not re-emit (stage-7 risk table: no
 * notification floods).
 */

import type {
  RestrictionKind,
  StandingEventKind,
} from '@tenda/shared/db/schema/reputation'
import type { InternalEscrowEvent } from '@server/lib/escrow-events'
import {
  FRAUD_RESTRICTION_REASON,
  RESTRICTION_TIERS,
  COLD_START_MIN_OUTCOMES,
  PUBLICLY_VISIBLE_KINDS,
} from '@server/features/reputation/config'
import { signalsFor, type SignalContext, type StandingSignal } from '@server/features/reputation/signals'

// ---------- store seam ---------------------------------------------------------

export interface StandingRow {
  completed_count: number
  abandoned_count: number
  ghosted_count: number
  disputed_won_count: number
  disputed_lost_count: number
  fraud_confirmed_count: number
  restriction_until: Date | null
  restriction_kind: RestrictionKind | null
  restriction_reason: string | null
}

export interface ReputationStore {
  getEscrowContext(escrow_id: string): Promise<SignalContext | null>
  insertStandingEvent(e: { user_id: string; escrow_id: string | null; kind: StandingEventKind; role: 'creator' | 'counterparty' }): Promise<void>
  /** Bump the lifetime counter for the kind (upserts the standing row). */
  bumpCounter(user_id: string, kind: StandingEventKind): Promise<void>
  /** Count events of `kind` for the user within the window. */
  countInWindow(user_id: string, kind: StandingEventKind, since: Date): Promise<number>
  getStanding(user_id: string): Promise<StandingRow | null>
  setRestriction(
    user_id: string,
    r: { kind: RestrictionKind; until: Date | null; reason: string },
  ): Promise<void>
  clearRestriction(user_id: string): Promise<void>
  /** Admin override: zero the lifetime counters (events stay for audit). */
  resetCounters(user_id: string): Promise<void>
}

export interface StandingEmitter {
  restricted(user_id: string, kind: RestrictionKind, until: Date | null): Promise<void>
  cleared(user_id: string): Promise<void>
}

export interface ReputationDeps {
  store: ReputationStore
  emit: StandingEmitter
  now(): Date
}

// ---------- event application -----------------------------------------------------

export interface ApplyStandingResult {
  signals: StandingSignal[]
  restricted: Array<{ user_id: string; kind: RestrictionKind }>
}

/**
 * Consume one internal escrow event (queue subscription per stage-7 §
 * Event subscriptions; per-user serialization is worker config at #33).
 */
export async function applyStandingEvent(
  deps: ReputationDeps,
  input: { internal_event: InternalEscrowEvent; escrow_id: string },
): Promise<ApplyStandingResult> {
  const ctx = await deps.store.getEscrowContext(input.escrow_id)
  if (ctx === null) return { signals: [], restricted: [] }

  const signals = signalsFor(input.internal_event, ctx)
  const restricted: Array<{ user_id: string; kind: RestrictionKind }> = []

  const TIER_SIGNALS: ReadonlyArray<StandingEventKind> = RESTRICTION_TIERS.map((t) => t.signal)
  for (const signal of signals) {
    await deps.store.insertStandingEvent({
      user_id: signal.user_id,
      escrow_id: input.escrow_id,
      kind: signal.kind,
      role: signal.role,
    })
    await deps.store.bumpCounter(signal.user_id, signal.kind)

    // Only tier-bearing signals can change a restriction, positive/neutral
    // kinds skip the window queries entirely.
    if (!TIER_SIGNALS.includes(signal.kind)) continue
    const applied = await evaluateTiers(deps, signal.user_id)
    if (applied !== null) restricted.push({ user_id: signal.user_id, kind: applied })
  }
  return { signals, restricted }
}

/**
 * Admin fraud confirmation (off-chain event `admin.fraud_confirmed`):
 * records the signal and applies manual_review immediately.
 */
export async function applyFraudConfirmed(
  deps: ReputationDeps,
  input: { user_id: string; escrow_id: string | null; role: 'creator' | 'counterparty' },
): Promise<void> {
  await deps.store.insertStandingEvent({
    user_id: input.user_id,
    escrow_id: input.escrow_id,
    kind: 'fraud_confirmed',
    role: input.role,
  })
  await deps.store.bumpCounter(input.user_id, 'fraud_confirmed')
  await deps.store.setRestriction(input.user_id, {
    kind: 'manual_review',
    until: null,
    reason: FRAUD_RESTRICTION_REASON,
  })
  await deps.emit.restricted(input.user_id, 'manual_review', null)
}

/**
 * Evaluate the tier table for one user. Applies the strictest matching
 * tier; emits `restricted` only when the restriction actually changes
 * (crossing), returns the applied kind then, null otherwise.
 *
 * manual_review is never overridden by tier evaluation, only admin lifts.
 */
async function evaluateTiers(
  deps: ReputationDeps,
  user_id: string,
): Promise<RestrictionKind | null> {
  const current = await deps.store.getStanding(user_id)
  if (current?.restriction_kind === 'manual_review') return null

  const now = deps.now()
  let strictest: { kind: RestrictionKind; until: Date; reason: string } | null = null
  for (const tier of RESTRICTION_TIERS) {
    const since = new Date(now.getTime() - tier.window_days * 86_400_000)
    const count = await deps.store.countInWindow(user_id, tier.signal, since)
    if (count < tier.threshold) continue
    const until = new Date(now.getTime() + tier.duration_days * 86_400_000)
    if (strictest === null || until > strictest.until) {
      strictest = { kind: tier.kind, until, reason: tier.reason }
    }
  }
  if (strictest === null) return null

  // Crossing check: same kind with an active until that already covers the
  // new horizon → no change, no re-emit.
  const activeSame =
    current !== null &&
    current.restriction_kind === strictest.kind &&
    current.restriction_until !== null &&
    current.restriction_until >= strictest.until
  if (activeSame) return null

  await deps.store.setRestriction(user_id, {
    kind: strictest.kind,
    until: strictest.until,
    reason: strictest.reason,
  })
  await deps.emit.restricted(user_id, strictest.kind, strictest.until)
  return strictest.kind
}

// ---------- eligibility + public summary ---------------------------------------------

export type GuardedOperation = 'create' | 'accept' | 'dispute'

const KIND_BY_OPERATION: Record<GuardedOperation, RestrictionKind> = {
  create: 'create_cooldown',
  accept: 'accept_cooldown',
  dispute: 'dispute_cooldown',
}

export type OperationCheck =
  | { allowed: true }
  | { allowed: false; kind: RestrictionKind; until: Date | null; reason: string }

/** A restriction currently in force (expiry already accounted for). */
export interface ActiveRestriction {
  kind: RestrictionKind
  until: Date | null
  reason: string | null
}

/**
 * Single source of truth for "is a restriction in force right now",
 * the guard, the public summary and /users/me/standing all defer here.
 */
export function activeRestriction(row: StandingRow | null, now: Date): ActiveRestriction | null {
  if (row === null || row.restriction_kind === null) return null
  if (row.restriction_until !== null && row.restriction_until < now) return null
  return {
    kind: row.restriction_kind,
    until: row.restriction_until,
    reason: row.restriction_reason,
  }
}

export function defaultRestrictionReason(kind: RestrictionKind): string {
  return kind === 'manual_review' ? 'account under review' : 'temporarily restricted'
}

/**
 * The authoritative gate the routes call. Expired restrictions pass
 * transparently (the row is cleaned lazily on the next event).
 */
export async function checkOperationAllowed(
  deps: { store: Pick<ReputationStore, 'getStanding'>; now(): Date },
  user_id: string,
  op: GuardedOperation,
): Promise<OperationCheck> {
  const standing = await deps.store.getStanding(user_id)
  const active = activeRestriction(standing, deps.now())
  if (active === null) return { allowed: true }

  if (active.kind === 'manual_review') {
    return {
      allowed: false,
      kind: 'manual_review',
      until: null,
      reason: active.reason ?? defaultRestrictionReason('manual_review'),
    }
  }
  if (active.kind === KIND_BY_OPERATION[op]) {
    return {
      allowed: false,
      kind: active.kind,
      until: active.until,
      reason: active.reason ?? defaultRestrictionReason(active.kind),
    }
  }
  return { allowed: true }
}

export interface PublicStanding {
  /** Null below the cold-start floor, UI shows "New user". */
  completion_rate: number | null
  completed_count: number
  /** True for restrictions visible to other users ("limited account"). */
  is_limited: boolean
}

export function toPublicStanding(row: StandingRow | null, now: Date): PublicStanding {
  if (row === null) {
    return { completion_rate: null, completed_count: 0, is_limited: false }
  }
  const outcomes = row.completed_count + row.abandoned_count + row.ghosted_count
  const completion_rate =
    outcomes >= COLD_START_MIN_OUTCOMES ? row.completed_count / outcomes : null
  const active = activeRestriction(row, now)
  const is_limited = active !== null && PUBLICLY_VISIBLE_KINDS.includes(active.kind)
  return { completion_rate, completed_count: row.completed_count, is_limited }
}
