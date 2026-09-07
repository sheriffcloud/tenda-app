/**
 * Gig applications — the pure half.
 *
 * Every decision here is a function of values the caller already has, so the
 * interesting rules (freshness, capacity, who may act) are testable without a
 * database. The SQL lives in `store.ts`; the wiring in `guards.ts`.
 *
 * The governing rule, from D2: an application is what makes a worker
 * ACCOUNTABLE for a gig they are assigned to. A worker who raised their hand
 * and then vanished earns an abandonment strike; one the poster placed out of
 * the blue does not. That is why freshness is decided here rather than left to
 * the sweep — a stale row must never be assignable, or the strike would attach
 * to someone who applied weeks ago and moved on.
 */

import {
  APPLICATION_ASSIGN_HOLD_SECONDS,
  APPLICATION_MESSAGE_MAX_LENGTH,
  type ApplicationStatus,
} from '@tenda/shared'

/** The subset of an application row the pure rules need. */
export interface ApplicationSnapshot {
  status: ApplicationStatus
  expires_at: Date
}

export interface ApplicationCapacityCheck {
  allowed: boolean
  /** Open applications the worker currently holds. */
  open: number
  /** Configured ceiling (`platform_config.max_open_applications`). */
  limit: number
  /** Slots left; clamped, so it is safe to show a user. */
  remaining: number
}

/**
 * An application is assignable only while it is `open` AND unexpired.
 *
 * Expiry is evaluated against `now` rather than trusting the sweep to have run:
 * the job is a tidier, not a gate. A row whose `expires_at` has passed is dead
 * the moment it passes, whether or not anything has swept it yet.
 */
export function isAssignable(application: ApplicationSnapshot, now: Date): boolean {
  return application.status === 'open' && application.expires_at.getTime() > now.getTime()
}

/** `open < limit` — a worker at exactly the limit is blocked from applying again. */
export function checkApplicationCapacity(open: number, limit: number): ApplicationCapacityCheck {
  return {
    allowed: open < limit,
    open,
    limit,
    // `open` can exceed `limit` if an operator lowered the cap, so clamp
    // rather than subtracting raw (mirrors features/capacity).
    remaining: Math.max(0, limit - open),
  }
}

export function applicationCapacityMessage(check: ApplicationCapacityCheck): string {
  const applications = check.limit === 1 ? 'application' : 'applications'
  return `You can have ${check.limit} open ${applications} at a time. Withdraw one, or wait for a poster to decide, before applying to another gig.`
}

/** When a newly created (or re-opened) application should stop being assignable. */
export function applicationExpiry(now: Date, ttl_seconds: number): Date {
  return new Date(now.getTime() + ttl_seconds * 1_000)
}

/**
 * The deadline an in-flight assignment holds an application to.
 *
 * Only ever EXTENDS: a hold must not shorten a row that already outlives it,
 * or picking an applicant early in their window would quietly bring their
 * expiry forward.
 */
export function heldExpiry(current: Date, now: Date): Date {
  const held = new Date(now.getTime() + APPLICATION_ASSIGN_HOLD_SECONDS * 1_000)
  return held.getTime() > current.getTime() ? held : current
}

/**
 * Validate the optional pitch. Returns the trimmed value, or null when the
 * applicant sent nothing — an empty string and an absent field mean the same
 * thing to a reader, so they are stored the same way.
 */
export function normaliseApplicationMessage(message: string | null | undefined): string | null {
  if (message === null || message === undefined) return null
  const trimmed = message.trim()
  if (trimmed === '') return null
  return trimmed
}

export function isApplicationMessageTooLong(message: string | null): boolean {
  return message !== null && message.length > APPLICATION_MESSAGE_MAX_LENGTH
}
