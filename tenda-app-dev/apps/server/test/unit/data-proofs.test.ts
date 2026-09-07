/**
 * DATA proofs (geotag/text/structured): upload-shape validation of the
 * payload class, and the add-time checks against what the gig declared —
 * geotag VERIFIED inside the radius, structured CONFORMANCE-checked against
 * the declared fields, and nothing checked where nothing was declared
 * (exchange escrows, volunteered proofs).
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { ErrorCode, MAX_PROOF_TEXT_LENGTH } from '@tenda/shared'
import { validateEscrowProofUploads } from '@server/features/escrows/proofs/validateEscrowProofUploads'
import {
  checkDataProofsAgainstGig,
  type GigProofContext,
} from '@server/features/escrows/proofs/checkDataProofsAgainstGig'
import { AppError } from '@server/lib/errors'

const USER = 'user-1'
const fileUrl = `https://res.cloudinary.com/test-cloud/image/upload/tenda/proofs/${USER}/a.jpg`

function expectAppError(fn: () => void, status: number, code: string, match: RegExp) {
  assert.throws(
    fn,
    (err: unknown) =>
      err instanceof AppError &&
      err.statusCode === status &&
      err.code === code &&
      match.test(err.message),
  )
}

// ---------- validateEscrowProofUploads: the payload class -------------------

test('data proofs validate and normalise (url null, text trimmed)', () => {
  const validated = validateEscrowProofUploads(
    [
      { type: 'geotag', payload: { latitude: 6.5244, longitude: 3.3792 } },
      { type: 'text', payload: { text: '  left with the receptionist  ' } },
      { type: 'structured', payload: { values: { count: 3 } } },
    ],
    USER,
  )
  assert.deepEqual(validated, [
    { type: 'geotag', url: null, payload: { latitude: 6.5244, longitude: 3.3792 } },
    { type: 'text', url: null, payload: { text: 'left with the receptionist' } },
    { type: 'structured', url: null, payload: { values: { count: 3 } } },
  ])
})

test('a data proof carrying a url is refused — one substance per class', () => {
  expectAppError(
    () =>
      validateEscrowProofUploads(
        [{ type: 'geotag', url: fileUrl, payload: { latitude: 1, longitude: 2 } }],
        USER,
      ),
    400,
    ErrorCode.VALIDATION_ERROR,
    /geotag proof carries a payload, not a url/,
  )
})

test('a file proof carrying a payload is refused', () => {
  expectAppError(
    () => validateEscrowProofUploads([{ type: 'image', url: fileUrl, payload: { text: 'x' } }], USER),
    400,
    ErrorCode.VALIDATION_ERROR,
    /image proof carries a url, not a payload/,
  )
})

test('a malformed payload is refused with the parser message', () => {
  expectAppError(
    () => validateEscrowProofUploads([{ type: 'geotag', payload: { latitude: 91, longitude: 0 } }], USER),
    400,
    ErrorCode.VALIDATION_ERROR,
    /latitude/,
  )
  expectAppError(
    () =>
      validateEscrowProofUploads(
        [{ type: 'text', payload: { text: 'x'.repeat(MAX_PROOF_TEXT_LENGTH + 1) } }],
        USER,
      ),
    400,
    ErrorCode.VALIDATION_ERROR,
    /at most/,
  )
  expectAppError(
    () => validateEscrowProofUploads([{ type: 'structured', payload: { values: {} } }], USER),
    400,
    ErrorCode.VALIDATION_ERROR,
    /empty/,
  )
})

test('a data proof with NO payload at all is refused', () => {
  expectAppError(
    () => validateEscrowProofUploads([{ type: 'text' }], USER),
    400,
    ErrorCode.VALIDATION_ERROR,
    /must be an object/,
  )
})

// ---------- checkDataProofsAgainstGig ---------------------------------------

// Gig pinned in Lagos; 0.0045° of latitude ≈ 500 m.
const GIG: GigProofContext = {
  latitude: 6.5244,
  longitude: 3.3792,
  proof_params: {
    geotag: { radius_m: 600 },
    structured: {
      fields: [
        { name: 'count', kind: 'number', required: true },
        { name: 'note', kind: 'string', required: false },
      ],
    },
  },
}

const geotagAt = (latitude: number, longitude: number) =>
  ({ type: 'geotag', url: null, payload: { latitude, longitude } }) as const

test('a geotag inside the declared radius passes', () => {
  assert.doesNotThrow(() => checkDataProofsAgainstGig([geotagAt(6.5289, 3.3792)], GIG))
})

test('a geotag outside the radius is refused with the measured distance', () => {
  expectAppError(
    () => checkDataProofsAgainstGig([geotagAt(6.5344, 3.3792)], GIG), // ~1.1 km
    400,
    ErrorCode.PROOF_CHECK_FAILED,
    /requires within 600 m/,
  )
})

test('the radius boundary is inclusive — at the pin always passes', () => {
  assert.doesNotThrow(() => checkDataProofsAgainstGig([geotagAt(6.5244, 3.3792)], GIG))
})

test('conformant structured values pass; a mismatch is refused', () => {
  assert.doesNotThrow(() =>
    checkDataProofsAgainstGig(
      [{ type: 'structured', url: null, payload: { values: { count: 2 } } }],
      GIG,
    ),
  )
  expectAppError(
    () =>
      checkDataProofsAgainstGig(
        [{ type: 'structured', url: null, payload: { values: { count: 'two' } } }],
        GIG,
      ),
    400,
    ErrorCode.PROOF_CHECK_FAILED,
    /"count" must be a number/,
  )
  expectAppError(
    () =>
      checkDataProofsAgainstGig(
        [{ type: 'structured', url: null, payload: { values: { count: 1, extra: true } } }],
        GIG,
      ),
    400,
    ErrorCode.PROOF_CHECK_FAILED,
    /"extra" is not a declared field/,
  )
})

test('nothing declared means nothing checked (exchange escrow, volunteered proof)', () => {
  const farAway = geotagAt(0, 0)
  // No gig row at all — an exchange escrow.
  assert.doesNotThrow(() => checkDataProofsAgainstGig([farAway], null))
  // A gig that declared no params.
  assert.doesNotThrow(() =>
    checkDataProofsAgainstGig([farAway], { latitude: 6.5, longitude: 3.4, proof_params: null }),
  )
  // Params declared but the gig lost its pin (defensive: create refuses this).
  assert.doesNotThrow(() =>
    checkDataProofsAgainstGig([farAway], { ...GIG, latitude: null, longitude: null }),
  )
})

test('file and text proofs pass through the checker untouched', () => {
  assert.doesNotThrow(() =>
    checkDataProofsAgainstGig(
      [
        { type: 'image', url: fileUrl, payload: null },
        { type: 'text', url: null, payload: { text: 'done' } },
      ],
      GIG,
    ),
  )
})
