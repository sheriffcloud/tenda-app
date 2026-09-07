import { isValidLatitude, isValidLongitude, ErrorCode } from '@tenda/shared'
import { AppError } from './errors'

/**
 * A plain object — the shape every JSON body/header field is inspected as
 * before any of its members is read. Arrays are refused: `typeof [] ===
 * 'object'`, and a decoder that then reads `.signature` off one would answer
 * "field missing" for what is a wrong TYPE. ONE copy for every decoder.
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Throws a 400 AppError if either coordinate is present but out of valid range.
 * Accepts undefined/null (field not provided) without error.
 */
export function ensureValidCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): void {
  if (latitude != null && !isValidLatitude(latitude)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'latitude must be between -90 and 90')
  }
  if (longitude != null && !isValidLongitude(longitude)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'longitude must be between -180 and 180')
  }
}

/**
 * Throws a 400 AppError unless `value` is an integer within `[min, max]`.
 * Absent (undefined) passes — PATCH bodies are partial by design.
 *
 * Extracted from the admin platform-config route, which was accumulating one
 * hand-written copy of this check per tunable; the bounds themselves stay with
 * the caller so each field can cite its own source (ESCROW_LIMITS for
 * chain-mirrored caps, MAX_PENDING_GIGS_CEILING for the capacity ceiling).
 */
export function ensureIntInRange(
  value: number | undefined,
  field: string,
  min: number,
  max: number,
): void {
  if (value === undefined) return
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `${field} must be an integer between ${min} and ${max}`,
    )
  }
}

/**
 * An optional body field: absent stays absent, anything present must be a
 * string within `max`. `optionalString` returns it as sent; `optionalName`
 * TRIMS it, and that difference is the whole reason there are two.
 *
 * Shared because `first_name`/`last_name` have TWO self-service write paths —
 * PATCH /v1/users/me and PATCH /v1/users/:id — and a name stored through one
 * has to mean the same thing as a name stored through the other. They had
 * diverged: `me` type-checked and capped the length, `:id` did neither, so the
 * same body was a 422 on one route and reached the column untouched on the
 * other.
 *
 * TRIMS rather than rejecting blank: `'  '` collapses to `''`, already this
 * schema's "not set" (the columns are NOT NULL, default empty), so a blank name
 * keeps the meaning it has always had instead of becoming a new 422 that older
 * clients have never had to handle. It also quietly fixes the case nobody
 * reports — a trailing space from a phone keyboard's autocomplete.
 *
 * `null` is rejected by the `typeof` test, not passed through as "leave
 * alone" — and that matters, because the name columns are NOT NULL. A null had
 * never been storable: it reached Postgres and came back a 500, and quietly
 * skipping it instead would answer 200 for a write that did not happen. A 422
 * naming the field is the only one of the three a client can act on.
 *
 * Length is checked BEFORE the trim. Not for safety — the columns are `text`
 * with no DB bound, and checking after the trim would cap exactly what gets
 * stored, so nothing can "sneak" past either way. The reason is continuity:
 * PATCH /v1/users/me has always measured the raw string, and moving the check
 * would turn bodies it currently 422s into successes.
 *
 * The cost, stated plainly: 100 characters followed by a space is refused even
 * though the trimmed value would have fitted. Nobody has hit it, and swapping
 * to `value.trim().length` is a one-word change if anyone does.
 */
export function optionalString(field: string, value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > max) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, `${field} must be a string ≤ ${max} chars`)
  }
  return value
}

/** `optionalString` plus a trim. See the note above for why both exist. */
export function optionalName(field: string, value: unknown, max: number): string | undefined {
  return optionalString(field, value, max)?.trim()
}
