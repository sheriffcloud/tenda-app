/**
 * Validation + normalisation for the gig create-detail body
 * (POST /v1/gigs, cutover §3). Pure: DB guards (escrow ownership/state)
 * and the Stage-6 moderation gate stay in the route; everything testable
 * without I/O lives here.
 */
import {
  isCityInCountry,
  isCountryCode,
  isCrossBorder,
  isProofType,
  normaliseProofRequirements,
  parseProofParams,
  MAX_GIG_TITLE_LENGTH,
  MAX_GIG_DESCRIPTION_LENGTH,
  LOCATIONS,
  GIG_CATEGORIES,
  PROOF_TYPES,
  MAX_PROOF_REQUIREMENTS,
  ErrorCode,
} from '@tenda/shared'
import type {
  CreateGigDetailsBody,
  GigCategory,
  CountryCode,
  ProofParams,
  ProofType,
} from '@tenda/shared'
import { AppError } from './errors'
import { ensureValidCoordinates } from './validation'

export interface ValidatedGigDetails {
  title: string
  description: string | null
  category: GigCategory
  country: CountryCode | null
  city: string | null
  latitude: number | null
  longitude: number | null
  remote: boolean
  cross_border: boolean
  proof_requirements: ProofType[]
  proof_params: ProofParams | null
}

function fail(message: string): never {
  throw new AppError(400, ErrorCode.VALIDATION_ERROR, message)
}

/**
 * Normalise the poster's declared proof requirements. Absent/empty means
 * "any evidence", the pre-existing behaviour. Deduplicated into PROOF_TYPES
 * order so photo-then-video and video-then-photo store identically.
 */
function validateProofRequirements(value: unknown): ProofType[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) fail('proof_requirements must be an array')
  // `Array.isArray` narrows `unknown` to `any[]`, which would silently pass an
  // untyped element into normalise. Re-widen to `unknown[]` so each entry has
  // to survive `isProofType` before it is treated as one.
  const entries: readonly unknown[] = value
  if (entries.length > MAX_PROOF_REQUIREMENTS) {
    fail(`proof_requirements accepts at most ${MAX_PROOF_REQUIREMENTS} entries`)
  }
  const typed: ProofType[] = []
  for (const entry of entries) {
    if (!isProofType(entry)) {
      fail(`proof_requirements entries must be one of: ${PROOF_TYPES.join(', ')}`)
    }
    typed.push(entry)
  }
  return normaliseProofRequirements(typed)
}

/**
 * Validates the listing fields. Remote gigs carry no country/city; physical
 * gigs require both (the work location). The cross-border flag is derived by
 * comparing the work country against the creator's stored country. Throws
 * AppError(400) on the first violation.
 */
export function validateGigDetails(
  body: Partial<CreateGigDetailsBody>,
  creatorCountry: string | null,
): ValidatedGigDetails {
  const {
    title,
    description,
    category,
    country,
    remote = false,
    city,
    latitude,
    longitude,
    proof_requirements,
    proof_params,
  } = body

  if (typeof title !== 'string' || title.trim() === '') fail('title is required')
  if (title.length > MAX_GIG_TITLE_LENGTH) {
    fail(`Title must be at most ${MAX_GIG_TITLE_LENGTH} characters`)
  }
  // The TYPE of these two, not only their value. A body reaches here as parsed
  // JSON, so the declared types are a claim, not a check — and an agent
  // composes it from a program rather than a form. `description: 42` passed the
  // length test (`undefined > max` is false) and then threw on `.trim()`, a 500
  // where this validator answers 400; `remote: 'no'` is TRUTHY, so the country
  // and city requirements below were skipped while the boolean column stored
  // false — an on-site gig with no location, which is the state those two
  // checks exist to prevent.
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') fail('description must be a string')
    if (description.length > MAX_GIG_DESCRIPTION_LENGTH) {
      fail(`Description must be at most ${MAX_GIG_DESCRIPTION_LENGTH} characters`)
    }
  }
  if (typeof remote !== 'boolean') fail('remote must be a boolean')
  if (!GIG_CATEGORIES.includes(category as GigCategory)) {
    fail(`category must be one of: ${GIG_CATEGORIES.join(', ')}`)
  }
  if (!remote && !city) fail('city is required for non-remote gigs')
  if (!remote && !country) fail('country is required for non-remote gigs')
  ensureValidCoordinates(latitude, longitude)

  // Remote gigs are location-agnostic: they carry no country or city. Physical
  // gigs must name the country (and city) where the WORK happens, the worker's
  // location, independent of where the poster posts from. We never back-fill the
  // creator's country onto a remote gig.
  let resolvedCountry: CountryCode | null = null
  if (!remote) {
    // `isCountryCode`, not `country in LOCATIONS`: LOCATIONS inherits from
    // Object.prototype, so `in` admitted 'toString' / 'constructor' /
    // '__proto__' and the city cross-check below then threw a TypeError (a 500
    // where this line is written to answer 400).
    if (country === undefined || !isCountryCode(country)) {
      fail(`country must be one of: ${Object.keys(LOCATIONS).join(', ')}`)
    }
    // `isCountryCode` is a type guard, so the narrowing replaces the cast this
    // line used to carry.
    resolvedCountry = country
    if (city && !isCityInCountry(resolvedCountry, city)) {
      fail(`city "${city}" is not in country ${resolvedCountry}`)
    }
  }

  const requirements = validateProofRequirements(proof_requirements)
  // A geotag proof is verified against the gig's own pin — a gig without one
  // has nothing to verify against, so the requirement is refused at the door
  // rather than stored uncheckable.
  if (requirements.includes('geotag') && (latitude == null || longitude == null)) {
    fail('geotag proof requires the gig to have latitude and longitude')
  }
  const parsedParams = parseProofParams(requirements, proof_params)
  if (parsedParams.error !== undefined) fail(parsedParams.error)

  return {
    title: title.trim(),
    description: description?.trim() || null,
    category: category as GigCategory,
    country: resolvedCountry,
    city: remote ? null : (city ?? null),
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    remote,
    cross_border: isCrossBorder(remote, resolvedCountry, creatorCountry),
    proof_requirements: requirements,
    proof_params: parsedParams.params,
  }
}
