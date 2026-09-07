/**
 * lib/gig-details — validation matrix for the gig create-detail body
 * (POST /v1/gigs). Positive + negative cases per field. Invariant: remote
 * gigs carry no country/city; physical gigs require both. Cross-border is
 * derived by comparing the work country against the creator's country.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { MAX_GIG_TITLE_LENGTH, MAX_GIG_DESCRIPTION_LENGTH, MAX_PROOF_REQUIREMENTS } from '@tenda/shared'
import type { CreateGigDetailsBody } from '@tenda/shared'
import { validateGigDetails } from '@server/lib/gig-details'
import { AppError } from '@server/lib/errors'

function body(overrides: Partial<CreateGigDetailsBody> = {}): Partial<CreateGigDetailsBody> {
  return {
    escrow_id: 'e-1',
    title: 'Fix my fence',
    description: 'Wood panels',
    category: 'service' as CreateGigDetailsBody['category'],
    country: 'NG',
    remote: false,
    city: 'Lagos',
    ...overrides,
  }
}

function expect400(input: Partial<CreateGigDetailsBody>, creatorCountry: string | null, match: RegExp) {
  assert.throws(
    () => validateGigDetails(input, creatorCountry),
    (err: unknown) => err instanceof AppError && err.statusCode === 400 && match.test(err.message),
  )
}

test('happy path: trims text, keeps city, computes cross_border=false for same country', () => {
  const v = validateGigDetails(body({ title: '  Fix my fence  ' }), 'NG')
  assert.strictEqual(v.title, 'Fix my fence')
  assert.strictEqual(v.city, 'Lagos')
  assert.strictEqual(v.country, 'NG')
  assert.strictEqual(v.remote, false)
  assert.strictEqual(v.cross_border, false)
})

test('remote gig: carries no country or city (no creator-country fallback)', () => {
  const v = validateGigDetails(body({ remote: true, country: undefined, city: undefined }), 'NG')
  assert.strictEqual(v.country, null)
  assert.strictEqual(v.city, null)
  assert.strictEqual(v.cross_border, false)
})

test('remote gig: any provided country/city is dropped (remote is location-agnostic)', () => {
  const v = validateGigDetails(body({ remote: true, country: 'NG', city: 'Lagos' }), 'KE')
  assert.strictEqual(v.country, null)
  assert.strictEqual(v.city, null)
  assert.strictEqual(v.cross_border, false)
})

test('empty description normalises to null', () => {
  const v = validateGigDetails(body({ description: '   ' }), 'NG')
  assert.strictEqual(v.description, null)
})

test('title: required + max length', () => {
  expect400(body({ title: '' }), 'NG', /title is required/)
  expect400(body({ title: '   ' }), 'NG', /title is required/)
  expect400(body({ title: 'x'.repeat(MAX_GIG_TITLE_LENGTH + 1) }), 'NG', /at most/)
})

test('description: max length', () => {
  expect400(body({ description: 'x'.repeat(MAX_GIG_DESCRIPTION_LENGTH + 1) }), 'NG', /at most/)
})

test('category: must be a known category', () => {
  expect400(body({ category: 'not-a-category' as CreateGigDetailsBody['category'] }), 'NG', /category must be one of/)
})

test('non-remote: city and country required', () => {
  expect400(body({ city: undefined }), 'NG', /city is required/)
  expect400(body({ country: undefined }), 'NG', /country is required/)
})

test('country must exist in LOCATIONS (non-remote)', () => {
  expect400(body({ country: 'ZZ' }), 'NG', /country must be one of/)
})

test('remote gig is valid without any country, even when creator has none', () => {
  const v = validateGigDetails(body({ remote: true, country: undefined, city: undefined }), null)
  assert.strictEqual(v.country, null)
  assert.strictEqual(v.remote, true)
})

test('city must belong to the provided country', () => {
  expect400(body({ city: 'Nairobi' }), 'NG', /is not in country/)
})

test('coordinates validated when present', () => {
  expect400(body({ latitude: 91, longitude: 3.4 }), 'NG', /atitude|oordinate/)
})

test('an out-of-range longitude is rejected too (the latitude case alone left this branch untested)', () => {
  expect400(body({ latitude: 6.45, longitude: 181 }), 'NG', /ongitude|oordinate/)
})

test('cross_border: true when non-remote gig country differs from creator country', () => {
  const v = validateGigDetails(body(), 'KE')
  assert.strictEqual(v.cross_border, true)
})

// ---------- proof_requirements ---------------------------------------------

/**
 * Feed a deliberately-invalid `proof_requirements` through the validator.
 * The single cast in this suite: the field is typed, so malformed input can
 * only be expressed by widening once, here, rather than at each call site.
 */
function withProofRequirements(value: unknown): Partial<CreateGigDetailsBody> {
  return { ...body(), proof_requirements: value } as Partial<CreateGigDetailsBody>
}

test('proof_requirements defaults to empty when omitted', () => {
  assert.deepEqual(validateGigDetails(body(), 'NG').proof_requirements, [])
})

test('proof_requirements accepts null as "no requirement"', () => {
  assert.deepEqual(validateGigDetails(withProofRequirements(null), 'NG').proof_requirements, [])
})

test('proof_requirements accepts an explicit empty array', () => {
  assert.deepEqual(
    validateGigDetails(body({ proof_requirements: [] }), 'NG').proof_requirements,
    [],
  )
})

test('proof_requirements normalises into declaration order', () => {
  assert.deepEqual(
    validateGigDetails(body({ proof_requirements: ['video', 'image'] }), 'NG').proof_requirements,
    ['image', 'video'],
  )
})

test('proof_requirements deduplicates repeats', () => {
  assert.deepEqual(
    validateGigDetails(body({ proof_requirements: ['image', 'image'] }), 'NG').proof_requirements,
    ['image'],
  )
})

test('proof_requirements accepts the full set', () => {
  assert.deepEqual(
    validateGigDetails(
      body({ proof_requirements: ['document', 'video', 'image'] }),
      'NG',
    ).proof_requirements,
    ['image', 'video', 'document'],
  )
})

test('proof_requirements rejects an unknown type', () => {
  expect400(withProofRequirements(['location']), 'NG', /proof_requirements entries must be one of/)
})

test('proof_requirements rejects a non-array', () => {
  expect400(withProofRequirements('image'), 'NG', /must be an array/)
})

test('proof_requirements rejects a non-string entry', () => {
  expect400(withProofRequirements([3]), 'NG', /proof_requirements entries must be one of/)
})

test('proof_requirements rejects an over-long array before inspecting entries', () => {
  // The cap is the vocabulary size (a deduplicated subset can never usefully
  // be longer), so the fixture derives from it rather than pinning a count
  // that grows with every added proof type.
  expect400(
    withProofRequirements(Array.from({ length: MAX_PROOF_REQUIREMENTS + 1 }, () => 'image')),
    'NG',
    new RegExp(`at most ${MAX_PROOF_REQUIREMENTS} entries`),
  )
})

test('proof_requirements rejects a nested array entry', () => {
  expect400(withProofRequirements([['image']]), 'NG', /must be one of/)
})

test('proof_requirements rejects a null entry', () => {
  expect400(withProofRequirements([null]), 'NG', /must be one of/)
})

// ---------- proof_params + the geotag-needs-a-pin rule ----------------------

test('proof_params flow through validated and normalised', () => {
  const v = validateGigDetails(
    body({
      latitude: 6.5244,
      longitude: 3.3792,
      proof_requirements: ['geotag', 'structured', 'image'],
      proof_params: {
        geotag: { radius_m: 500 },
        structured: { fields: [{ name: ' count ', kind: 'number', required: true }] },
      },
    }),
    'NG',
  )
  assert.deepEqual(v.proof_requirements, ['image', 'geotag', 'structured'])
  assert.deepEqual(v.proof_params, {
    geotag: { radius_m: 500 },
    structured: { fields: [{ name: 'count', kind: 'number', required: true }] },
  })
})

test('no param-bearing requirement stores null params', () => {
  const v = validateGigDetails(body({ proof_requirements: ['image', 'text'] }), 'NG')
  assert.strictEqual(v.proof_params, null)
})

test('a geotag requirement without coordinates is refused — nothing to verify against', () => {
  expect400(
    body({ proof_requirements: ['geotag'], proof_params: { geotag: { radius_m: 100 } } }),
    'NG',
    /latitude and longitude/,
  )
})

test('a geotag requirement without its radius is refused', () => {
  expect400(
    body({ latitude: 6.5, longitude: 3.4, proof_requirements: ['geotag'] }),
    'NG',
    /proof_params\.geotag is required/,
  )
})

test('a structured requirement without declared fields is refused', () => {
  expect400(
    body({ proof_requirements: ['structured'] }),
    'NG',
    /proof_params\.structured is required/,
  )
})

test('params for a type the gig does not require are refused', () => {
  expect400(
    body({ proof_requirements: ['image'], proof_params: { geotag: { radius_m: 100 } } }),
    'NG',
    /only valid when geotag proof is required/,
  )
})
