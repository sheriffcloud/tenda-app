/**
 * Escrow proof upload validation and submit requirement enforcement.
 * and the poster-declared requirement gate used by POST
 * /v1/escrows/:id/submit.
 *
 * Upload validation is the only
 * thing standing between a request body and a stored proof URL, so its
 * negative cases are asserted individually rather than as a group.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { ErrorCode, type ProofType } from '@tenda/shared'
import {
  validateEscrowProofUploads,
  type EscrowProofUploadInput,
} from '@server/features/escrows/proofs/validateEscrowProofUploads'
import { assertEscrowProofRequirementsMet } from '@server/features/escrows/proofs/assertEscrowProofRequirementsMet'
import { AppError } from '@server/lib/errors'

const USER = 'user-1'
const OTHER = 'user-2'

function url(userId: string, name = 'p1.jpg'): string {
  return `https://res.cloudinary.com/test-cloud/image/upload/tenda/proofs/${userId}/${name}`
}

function proofs(...items: EscrowProofUploadInput[]): EscrowProofUploadInput[] {
  return items
}

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

// ---------- validateEscrowProofUploads: positive --------------------------

test('validateEscrowProofUploads accepts every declared type in the uploader own folder', () => {
  assert.doesNotThrow(() =>
    validateEscrowProofUploads(
      proofs(
        { url: url(USER, 'a.jpg'), type: 'image' },
        { url: url(USER, 'b.mp4'), type: 'video' },
        { url: url(USER, 'c.pdf'), type: 'document' },
      ),
      USER,
    ),
  )
})

test('validateEscrowProofUploads accepts an empty list', () => {
  assert.doesNotThrow(() => validateEscrowProofUploads([], USER))
})

test('validateEscrowProofUploads allows exactly maxCount items', () => {
  const items = proofs(
    { url: url(USER, 'a.jpg'), type: 'image' },
    { url: url(USER, 'b.jpg'), type: 'image' },
  )
  assert.doesNotThrow(() => validateEscrowProofUploads(items, USER, 2))
})

// ---------- validateEscrowProofUploads: negative --------------------------

test('validateEscrowProofUploads rejects more than maxCount items', () => {
  const items = proofs(
    { url: url(USER, 'a.jpg'), type: 'image' },
    { url: url(USER, 'b.jpg'), type: 'image' },
  )
  expectAppError(
    () => validateEscrowProofUploads(items, USER, 1),
    400,
    ErrorCode.VALIDATION_ERROR,
    /maximum 1/,
  )
})

test('validateEscrowProofUploads rejects an unknown proof type', () => {
  expectAppError(
    () => validateEscrowProofUploads(proofs({ url: url(USER), type: 'location' }), USER),
    400,
    ErrorCode.VALIDATION_ERROR,
    /Proof type must be one of/,
  )
})

test('validateEscrowProofUploads rejects a non-Cloudinary host', () => {
  expectAppError(
    () =>
      validateEscrowProofUploads(
        proofs({ url: `https://evil.example.com/tenda/proofs/${USER}/a.jpg`, type: 'image' }),
        USER,
      ),
    400,
    ErrorCode.VALIDATION_ERROR,
    /Cloudinary/,
  )
})

test("validateEscrowProofUploads rejects a URL in another user's folder", () => {
  expectAppError(
    () => validateEscrowProofUploads(proofs({ url: url(OTHER), type: 'image' }), USER),
    400,
    ErrorCode.VALIDATION_ERROR,
    /not uploaded by the submitting user/,
  )
})

test('validateEscrowProofUploads reports the first violation when several are present', () => {
  // Bad type comes before the host check in the same iteration.
  expectAppError(
    () => validateEscrowProofUploads(proofs({ url: 'https://evil.example.com/x.jpg', type: 'nope' }), USER),
    400,
    ErrorCode.VALIDATION_ERROR,
    /Proof type must be one of/,
  )
})

// ---------- assertEscrowProofRequirementsMet: positive --------------------

const attached = (...types: ProofType[]) => types.map((type) => ({ type }))

test('no requirements passes with nothing attached', () => {
  assert.doesNotThrow(() => assertEscrowProofRequirementsMet([], []))
})

test('no requirements passes with proofs attached', () => {
  assert.doesNotThrow(() => assertEscrowProofRequirementsMet([], attached('image')))
})

test('exact coverage passes', () => {
  assert.doesNotThrow(() => assertEscrowProofRequirementsMet(['image', 'video'], attached('image', 'video')))
})

test('surplus proofs beyond the requirement pass', () => {
  assert.doesNotThrow(() =>
    assertEscrowProofRequirementsMet(['image'], attached('image', 'video', 'document')),
  )
})

test('duplicates of the required type pass', () => {
  assert.doesNotThrow(() => assertEscrowProofRequirementsMet(['image'], attached('image', 'image')))
})

// ---------- assertEscrowProofRequirementsMet: negative --------------------

test('nothing attached against one requirement is refused as 409', () => {
  expectAppError(
    () => assertEscrowProofRequirementsMet(['video'], []),
    409,
    ErrorCode.PROOF_REQUIREMENT_UNMET,
    /video/,
  )
})

test('partial coverage names only the missing type', () => {
  expectAppError(
    () => assertEscrowProofRequirementsMet(['image', 'video'], attached('image')),
    409,
    ErrorCode.PROOF_REQUIREMENT_UNMET,
    /video/,
  )
})

test('a wrong-type proof does not satisfy the requirement', () => {
  expectAppError(
    () => assertEscrowProofRequirementsMet(['document'], attached('image')),
    409,
    ErrorCode.PROOF_REQUIREMENT_UNMET,
    /document/,
  )
})

test('the error carries the missing types as structured details', () => {
  assert.throws(
    () => assertEscrowProofRequirementsMet(['image', 'document'], attached('image')),
    (err: unknown) =>
      err instanceof AppError &&
      JSON.stringify(err.details ?? {}).includes('document'),
  )
})
