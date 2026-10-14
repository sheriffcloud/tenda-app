/**
 * DATA-proof payloads — the machine-readable half of the proof vocabulary.
 * A data proof carries a `payload` instead of an uploaded file's `url`; these
 * are the shapes, their bounds, and the SHAPE validation every payload passes
 * at upload time.
 *
 * Naming is deliberate (see the class doc in ./proofs): shape-parsing here is
 * not verification. Geotag additionally gets a geometric VERIFY against the
 * gig's declared radius, structured gets a CONFORMANCE check against the
 * gig's declared fields (../constants/proof-params) — text is only ever
 * shape-checked.
 */
import type { DataProofType } from './proofs'
import { MAX_STRUCTURED_FIELDS, MAX_STRUCTURED_FIELD_NAME_LENGTH } from './proof-params'
import { hasNulChar, isValidLatitude, isValidLongitude, MAX_GIG_DESCRIPTION_LENGTH } from '../utils/validation'

export interface GeotagProofPayload {
  latitude: number
  longitude: number
}

export interface TextProofPayload {
  text: string
}

export type StructuredProofValue = string | number | boolean

export interface StructuredProofPayload {
  values: Record<string, StructuredProofValue>
}

export type ProofPayload = GeotagProofPayload | TextProofPayload | StructuredProofPayload

/** DERIVED from the gig-description cap — a written answer is prose, not a
 *  file, and "matches" enforced by assignment cannot drift. */
export const MAX_PROOF_TEXT_LENGTH = MAX_GIG_DESCRIPTION_LENGTH
/**
 * Value bounds that are NOT their own facts take the declaration side's
 * constants directly (imported above): values conform to declared fields, so
 * the entry cap and the key-length cap are `MAX_STRUCTURED_FIELDS` and
 * `MAX_STRUCTURED_FIELD_NAME_LENGTH` — one constant each, not a mirrored
 * copy that can drift. Only the string-value cap is a payload-side fact.
 */
export const MAX_STRUCTURED_STRING_VALUE_LENGTH = 1000

export type ProofPayloadParse =
  | { payload: ProofPayload; error?: undefined }
  | { payload?: undefined; error: string }

function invalid(error: string): ProofPayloadParse {
  return { error }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The unknown keys of `value` beyond `allowed`, for strict-shape refusals. */
function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((k) => !allowed.includes(k))
}

/**
 * Shape-parse one data-proof payload. Returns the NORMALISED payload (text
 * trimmed) or the first problem as a caller-facing message. Strict about
 * unknown keys on purpose: the payload is identity (proofIdentity
 * canonicalises it) and machine-read downstream, so "extra junk survives"
 * would make equal evidence compare unequal and hand consumers fields nobody
 * validated.
 */
export function parseProofPayload(type: DataProofType, value: unknown): ProofPayloadParse {
  if (!isPlainObject(value)) return invalid(`${type} proof payload must be an object`)

  switch (type) {
    case 'geotag': {
      const extra = unknownKeys(value, ['latitude', 'longitude'])
      if (extra.length > 0) return invalid(`geotag payload has unknown keys: ${extra.join(', ')}`)
      const { latitude, longitude } = value
      if (typeof latitude !== 'number' || !isValidLatitude(latitude)) {
        return invalid('geotag latitude must be a number between -90 and 90')
      }
      if (typeof longitude !== 'number' || !isValidLongitude(longitude)) {
        return invalid('geotag longitude must be a number between -180 and 180')
      }
      return { payload: { latitude, longitude } }
    }
    case 'text': {
      const extra = unknownKeys(value, ['text'])
      if (extra.length > 0) return invalid(`text payload has unknown keys: ${extra.join(', ')}`)
      if (typeof value.text !== 'string') return invalid('text payload requires a text string')
      const text = value.text.trim()
      if (text.length === 0) return invalid('text proof cannot be empty')
      // NUL is the one character jsonb cannot store — refused here so it is
      // a 400, not a driver error (see hasNulChar).
      if (hasNulChar(text)) return invalid('text proof cannot contain the null character')
      if (text.length > MAX_PROOF_TEXT_LENGTH) {
        return invalid(`text proof must be at most ${MAX_PROOF_TEXT_LENGTH} characters`)
      }
      return { payload: { text } }
    }
    case 'structured': {
      const extra = unknownKeys(value, ['values'])
      if (extra.length > 0) return invalid(`structured payload has unknown keys: ${extra.join(', ')}`)
      if (!isPlainObject(value.values)) {
        return invalid('structured payload requires a values object')
      }
      const entries = Object.entries(value.values)
      if (entries.length === 0) return invalid('structured values cannot be empty')
      if (entries.length > MAX_STRUCTURED_FIELDS) {
        return invalid(`structured values accepts at most ${MAX_STRUCTURED_FIELDS} entries`)
      }
      // Collected as TUPLES and materialised with Object.fromEntries, never
      // by `obj[key] = value`: an own "__proto__" key (JSON.parse creates
      // one) hits the prototype SETTER under assignment and silently
      // vanishes — the stored payload then differs from what was sent.
      // fromEntries defines data properties, so the key survives as data.
      const checked: [string, StructuredProofValue][] = []
      for (const [key, raw] of entries) {
        if (key.length === 0 || key.length > MAX_STRUCTURED_FIELD_NAME_LENGTH) {
          return invalid(
            `structured value keys must be 1-${MAX_STRUCTURED_FIELD_NAME_LENGTH} characters`,
          )
        }
        if (hasNulChar(key)) {
          return invalid('structured value keys cannot contain the null character')
        }
        if (typeof raw === 'number') {
          if (!Number.isFinite(raw)) return invalid(`structured value "${key}" must be finite`)
          checked.push([key, raw])
        } else if (typeof raw === 'string') {
          if (raw.length > MAX_STRUCTURED_STRING_VALUE_LENGTH) {
            return invalid(
              `structured value "${key}" must be at most ${MAX_STRUCTURED_STRING_VALUE_LENGTH} characters`,
            )
          }
          if (hasNulChar(raw)) {
            return invalid(`structured value "${key}" cannot contain the null character`)
          }
          checked.push([key, raw])
        } else if (typeof raw === 'boolean') {
          checked.push([key, raw])
        } else {
          return invalid(`structured value "${key}" must be a string, number, or boolean`)
        }
      }
      return { payload: { values: Object.fromEntries(checked) } }
    }
  }
}
