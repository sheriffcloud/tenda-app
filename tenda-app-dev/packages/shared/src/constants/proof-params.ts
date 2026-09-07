/**
 * Per-type proof-requirement PARAMS — what a poster declares alongside
 * `proof_requirements` so a data proof can be checked, not just collected
 * (`gig_details.proof_params`).
 *
 * Params are MANDATORY for their type when that type is required: a geotag
 * requirement without a radius, or a structured requirement without declared
 * fields, is uncheckable — which defeats the reason the type exists. `text`
 * and the file types take no params, and declaring params for a type the gig
 * does not require is refused rather than stored dead.
 */
import type { ProofType } from './proofs'
import type { StructuredProofValue } from './proof-payloads'
import { hasNulChar } from '../utils/validation'

export interface GeotagProofParams {
  /** Accepted distance from the gig's coordinates, metres. */
  radius_m: number
}

export const STRUCTURED_FIELD_KINDS = ['string', 'number', 'boolean'] as const
export type StructuredFieldKind = (typeof STRUCTURED_FIELD_KINDS)[number]

/** What each kind is called where a POSTER picks one — never the wire word. */
export const STRUCTURED_FIELD_KIND_LABEL: Record<StructuredFieldKind, string> = {
  string: 'Text',
  number: 'Number',
  boolean: 'Yes / no',
}

export interface StructuredProofField {
  name: string
  kind: StructuredFieldKind
  required: boolean
}

export interface StructuredProofParams {
  fields: StructuredProofField[]
}

export interface ProofParams {
  geotag?: GeotagProofParams
  structured?: StructuredProofParams
}

/** The requirement types that carry params — the only legal proof_params keys. */
export const PARAM_PROOF_TYPES = ['geotag', 'structured'] as const satisfies readonly ProofType[]

export const MIN_GEOTAG_RADIUS_M = 10
export const MAX_GEOTAG_RADIUS_M = 50_000
/**
 * What the composers seed the radius field with — wide enough to absorb
 * ordinary phone GPS error at a work site, tight enough to still mean "you
 * were there". A poster can change it; the seed just should not be a value
 * the server would refuse.
 */
export const DEFAULT_GEOTAG_RADIUS_M = 500
export const MAX_STRUCTURED_FIELDS = 20
export const MAX_STRUCTURED_FIELD_NAME_LENGTH = 64

export type ProofParamsParse =
  | { params: ProofParams | null; error?: undefined }
  | { params?: undefined; error: string }

function invalid(error: string): ProofParamsParse {
  return { error }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse a poster's `proof_params` against their (already normalised)
 * `proof_requirements`. Returns the normalised params (field names trimmed),
 * `null` when the requirements need none, or the first problem as a
 * caller-facing message.
 */
export function parseProofParams(
  requirements: readonly ProofType[],
  value: unknown,
): ProofParamsParse {
  const needsGeotag = requirements.includes('geotag')
  const needsStructured = requirements.includes('structured')

  if (value === undefined || value === null) {
    if (needsGeotag) return invalid('proof_params.geotag is required when geotag proof is required')
    if (needsStructured) {
      return invalid('proof_params.structured is required when structured proof is required')
    }
    return { params: null }
  }
  if (!isPlainObject(value)) return invalid('proof_params must be an object')

  const unknown = Object.keys(value).filter(
    (k) => !(PARAM_PROOF_TYPES as readonly string[]).includes(k),
  )
  if (unknown.length > 0) {
    return invalid(`proof_params has unknown keys: ${unknown.join(', ')}`)
  }
  if (value.geotag !== undefined && !needsGeotag) {
    return invalid('proof_params.geotag is only valid when geotag proof is required')
  }
  if (value.structured !== undefined && !needsStructured) {
    return invalid('proof_params.structured is only valid when structured proof is required')
  }
  if (needsGeotag && value.geotag === undefined) {
    return invalid('proof_params.geotag is required when geotag proof is required')
  }
  if (needsStructured && value.structured === undefined) {
    return invalid('proof_params.structured is required when structured proof is required')
  }

  const params: ProofParams = {}

  if (value.geotag !== undefined) {
    if (!isPlainObject(value.geotag)) return invalid('proof_params.geotag must be an object')
    const extra = Object.keys(value.geotag).filter((k) => k !== 'radius_m')
    if (extra.length > 0) {
      return invalid(`proof_params.geotag has unknown keys: ${extra.join(', ')}`)
    }
    const radius = value.geotag.radius_m
    if (
      typeof radius !== 'number' ||
      !Number.isInteger(radius) ||
      radius < MIN_GEOTAG_RADIUS_M ||
      radius > MAX_GEOTAG_RADIUS_M
    ) {
      return invalid(
        `proof_params.geotag.radius_m must be an integer between ${MIN_GEOTAG_RADIUS_M} and ${MAX_GEOTAG_RADIUS_M}`,
      )
    }
    params.geotag = { radius_m: radius }
  }

  if (value.structured !== undefined) {
    if (!isPlainObject(value.structured)) {
      return invalid('proof_params.structured must be an object')
    }
    const extra = Object.keys(value.structured).filter((k) => k !== 'fields')
    if (extra.length > 0) {
      return invalid(`proof_params.structured has unknown keys: ${extra.join(', ')}`)
    }
    const rawFields = value.structured.fields
    if (!Array.isArray(rawFields) || rawFields.length === 0) {
      return invalid('proof_params.structured.fields must be a non-empty array')
    }
    if (rawFields.length > MAX_STRUCTURED_FIELDS) {
      return invalid(`proof_params.structured.fields accepts at most ${MAX_STRUCTURED_FIELDS} fields`)
    }
    const fields: StructuredProofField[] = []
    const seen = new Set<string>()
    for (const rawField of rawFields as readonly unknown[]) {
      if (!isPlainObject(rawField)) return invalid('each structured field must be an object')
      const fieldExtra = Object.keys(rawField).filter(
        (k) => !['name', 'kind', 'required'].includes(k),
      )
      if (fieldExtra.length > 0) {
        return invalid(`structured field has unknown keys: ${fieldExtra.join(', ')}`)
      }
      const name = typeof rawField.name === 'string' ? rawField.name.trim() : ''
      if (name.length === 0 || name.length > MAX_STRUCTURED_FIELD_NAME_LENGTH) {
        return invalid(
          `structured field names must be 1-${MAX_STRUCTURED_FIELD_NAME_LENGTH} characters`,
        )
      }
      // NUL cannot reach jsonb (see hasNulChar) — a 400 here, not a 500 later.
      if (hasNulChar(name)) {
        return invalid('structured field names cannot contain the null character')
      }
      if (seen.has(name)) return invalid(`structured field "${name}" is declared twice`)
      seen.add(name)
      if (!(STRUCTURED_FIELD_KINDS as readonly unknown[]).includes(rawField.kind)) {
        return invalid(
          `structured field "${name}" kind must be one of: ${STRUCTURED_FIELD_KINDS.join(', ')}`,
        )
      }
      if (typeof rawField.required !== 'boolean') {
        return invalid(`structured field "${name}" requires a boolean "required"`)
      }
      fields.push({ name, kind: rawField.kind as StructuredFieldKind, required: rawField.required })
    }
    params.structured = { fields }
  }

  return { params }
}

/**
 * CONFORMANCE check (not verification — see the class doc in ./proofs) of a
 * structured payload's values against the gig's declared fields: required
 * fields present, kinds match, no undeclared extras. Returns the first
 * problem or null when conformant.
 */
export function structuredValuesProblem(
  fields: readonly StructuredProofField[],
  values: Record<string, StructuredProofValue>,
): string | null {
  const byName = new Map(fields.map((f) => [f.name, f]))
  for (const key of Object.keys(values)) {
    if (!byName.has(key)) return `structured value "${key}" is not a declared field`
  }
  for (const field of fields) {
    // OWN property only: `values[name]` for a field named "__proto__" would
    // answer Object.prototype — an inherited object passed off as an answer.
    const value = Object.hasOwn(values, field.name) ? values[field.name] : undefined
    if (value === undefined) {
      if (field.required) return `structured field "${field.name}" is required`
      continue
    }
    if (typeof value !== field.kind) {
      return `structured field "${field.name}" must be a ${field.kind}`
    }
  }
  return null
}
