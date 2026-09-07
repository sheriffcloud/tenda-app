import {
  getAssetMeta,
  GIG_NATIVE_MAX_DISPLAY,
  GIG_NATIVE_MIN_DISPLAY,
  GIG_STABLE_MAX_DISPLAY,
  GIG_STABLE_MIN_DISPLAY,
} from '../constants/assets'
import { parseUnits, sanitizeDecimalText } from './units'
import { isAmountRaw } from './amount-raw'
import { ACCEPT_DEADLINE_OPTIONS, SECONDS_PER_HOUR } from '../constants/escrow'

/** E.164 phone format, e.g. +2348012345678 (stage-1 OTP routes). */
export const E164_RE = /^\+[1-9]\d{7,14}$/

export function isE164(v: unknown): v is string {
  return typeof v === 'string' && E164_RE.test(v)
}

/** Max stored email length — mirrors the admin_users / user_identities columns. */
export const EMAIL_MAX_LENGTH = 255

// Shape check only (catches typos, not RFC corner cases) — deliverability is
// proven by the OTP round-trip. Shared by admin login + consumer email auth.
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lowercase + trim; null when shape/length is invalid. Write sites MUST use this. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return null
  return EMAIL_SHAPE.test(email) ? email : null
}

export const MAX_REVIEW_COMMENT_LENGTH = 1000

/**
 * The one character Postgres jsonb cannot store: a NUL anywhere in a string
 * fails the cast ("unsupported Unicode escape sequence" — measured), so any
 * user text headed for a jsonb column must refuse it at validation or the
 * request dies as a driver error (500) instead of a 400.
 */
export function hasNulChar(text: string): boolean {
  return text.includes('\u0000')
}

export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
}

export function isValidLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180
}

export const MAX_GIG_TITLE_LENGTH       = 200
export const MAX_GIG_DESCRIPTION_LENGTH = 5000
export const MAX_DISPUTE_REASON_LENGTH  = 2000

// Duration bounds
export const MIN_COMPLETION_DURATION_SECONDS = 60 * 60        // 1 hour
export const MAX_COMPLETION_DURATION_SECONDS = 60 * 60 * 24 * 90 // 90 days

/**
 * Per-asset gig budget rails (CO5): stables get USDC bounds, native SOL
 * keeps the legacy lamport rails. Advisory UX limits — the program only
 * enforces amount > 0.
 */
/**
 * The advisory budget rails for one asset, in ITS base units.
 *
 * Scaled from the display-unit constants by the asset's own decimals, so the
 * same "1 to 50,000" rail means the same money whatever the precision. The
 * previous version returned fixed 6dp numbers for every stable asset, which
 * made cUSD (stable, 18 decimals) unusable — see the note on the constants.
 *
 * Strings, matching every other raw amount that crosses a boundary here.
 * An unknown asset falls back to the NATIVE rails and 9 decimals, which is
 * what the old code did by returning the lamport bounds.
 */
export function gigAmountBounds(asset: string): { min_raw: string; max_raw: string } {
  const meta = getAssetMeta(asset)
  const decimals = meta?.decimals ?? 9
  const [min, max] =
    meta?.is_stable === true
      ? [GIG_STABLE_MIN_DISPLAY, GIG_STABLE_MAX_DISPLAY]
      : [GIG_NATIVE_MIN_DISPLAY, GIG_NATIVE_MAX_DISPLAY]
  return { min_raw: railToRaw(min, decimals, true), max_raw: railToRaw(max, decimals, false) }
}

/**
 * One display-unit rail in an asset's base units.
 *
 * The rails are written at the precision a person reads ('0.001'), which can
 * be FINER than the asset can express — parseUnits answers null for that, and
 * a null minimum silently became '0', removing the floor entirely and
 * accepting any budget above zero. No asset in the registry is below 6
 * decimals today, so this is not currently reachable; it is handled because
 * adding an asset is meant to be a manifest entry and nothing else, and a
 * vanished minimum is not a failure anyone would notice.
 *
 * Truncating first (the same rule the input field uses) and flooring a
 * minimum at one base unit keeps the rail meaningful at any precision: the
 * smallest budget allowed, or the smallest the asset can express, whichever
 * is larger.
 */
function railToRaw(display: string, decimals: number, isMinimum: boolean): string {
  const raw = parseUnits(sanitizeDecimalText(display, decimals), decimals) ?? '0'
  return isMinimum && raw === '0' ? '1' : raw
}

/**
 * Whether a raw gig budget is inside the rails.
 *
 * `amount_raw` is a base-unit STRING compared with BigInt: 1 token of an
 * 18-decimal asset is 1e18 base units, past the 2^53 where `number` starts
 * rounding, so the old `Number.isInteger` version could not represent the
 * value it was checking.
 */
export function isValidGigAmountRaw(asset: string, amount_raw: string): boolean {
  if (!isAmountRaw(amount_raw)) return false
  const { min_raw, max_raw } = gigAmountBounds(asset)
  const value = BigInt(amount_raw)
  return value >= BigInt(min_raw) && value <= BigInt(max_raw)
}

/**
 * The shape both duration rails share: a whole number of seconds inside an
 * inclusive range. Named once because #41 added the second rail and copying the
 * body would have meant two places to fix if the rule ever gains a case.
 */
function isIntegerSecondsInRange(seconds: number, min: number, max: number): boolean {
  return Number.isInteger(seconds) && seconds >= min && seconds <= max
}

export function isValidCompletionDuration(seconds: number): boolean {
  return isIntegerSecondsInRange(seconds, MIN_COMPLETION_DURATION_SECONDS, MAX_COMPLETION_DURATION_SECONDS)
}

/**
 * Accept-window bounds, DERIVED from the option set both composers offer so the
 * pickers and the API can never disagree about the rail (the rule #52
 * established for the completion duration).
 *
 * This bound is the reason #41 moved the wire to a duration. An absolute
 * deadline has no natural ceiling, so it never got one: the only checks were
 * "is an integer" and "is in the future", and a caller passing `Date.now()` in
 * MILLISECONDS by mistake was accepted as a unix SECOND — a deadline in the
 * year 58,633, minted as a draft and handed back as a transaction to sign. A
 * duration has an obvious range, and this is it.
 */
export const MIN_ACCEPT_WINDOW_SECONDS =
  Math.min(...ACCEPT_DEADLINE_OPTIONS.map((option) => option.hours)) * SECONDS_PER_HOUR
export const MAX_ACCEPT_WINDOW_SECONDS =
  Math.max(...ACCEPT_DEADLINE_OPTIONS.map((option) => option.hours)) * SECONDS_PER_HOUR

export function isValidAcceptWindow(seconds: number): boolean {
  return isIntegerSecondsInRange(seconds, MIN_ACCEPT_WINDOW_SECONDS, MAX_ACCEPT_WINDOW_SECONDS)
}

// Maximum records per page — prevents runaway queries on all paginated endpoints
export const MAX_PAGINATION_LIMIT = 100

/**
 * Widest proximity search the feed accepts, in km (half the planet's
 * circumference: anything larger is "no filter" wearing a radius). The server
 * refuses a larger — or a non-positive — radius with 400.
 */
export const MAX_PROXIMITY_RADIUS_KM = 20_000

// Cloudinary CDN URLs always start with this prefix.
// Validate on receipt to prevent arbitrary URLs being stored in the DB.
export function isCloudinaryUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'res.cloudinary.com'
  } catch {
    return false
  }
}

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isValidWalletAddress(address: string): boolean {
  return SOLANA_ADDRESS_REGEX.test(address)
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export function isValidReviewScore(score: unknown): score is 1 | 2 | 3 | 4 | 5 {
  return typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 5
}

/**
 * Validate gig deadline inputs. Safe to call on both server and mobile.
 * accept_deadline must be in the future.
 * accept_deadline, if provided, must be at least 1 hour from now to be meaningful.
 */
export function validateGigDeadlines(
  completion_duration_seconds: number,
  accept_deadline?: string | null,
): ValidationResult {
  if (!isValidCompletionDuration(completion_duration_seconds)) {
    return {
      valid: false,
      error: `completion_duration_seconds must be between ${MIN_COMPLETION_DURATION_SECONDS} and ${MAX_COMPLETION_DURATION_SECONDS}`,
    }
  }

  if (accept_deadline != null) {
    const accept = new Date(accept_deadline)
    if (isNaN(accept.getTime())) {
      return { valid: false, error: 'accept_deadline is not a valid date' }
    }
    if (accept <= new Date()) {
      return { valid: false, error: 'accept_deadline must be in the future' }
    }
  }

  return { valid: true }
}
