/**
 * SHAPE validation for a proof-upload batch, both classes: a FILE proof
 * (image/video/document) is a Cloudinary url owned by the uploader, a DATA
 * proof (geotag/text/structured) is a parsed payload. Exactly one of the two
 * per proof — the other must be absent, refused rather than silently dropped.
 *
 * Pure and gig-blind on purpose: checks that need the gig's declared params
 * (geotag radius, structured fields) live in checkDataProofsAgainstGig, which
 * runs inside the route's transaction where the gig row is loaded.
 */
import {
  ErrorCode,
  isCloudinaryUrl,
  isDataProofType,
  isProofType,
  parseProofPayload,
  PROOF_TYPES,
  type ProofPayload,
  type ProofType,
} from '@tenda/shared'
import { AppError } from '@server/lib/errors'

export interface EscrowProofUploadInput {
  type: string
  url?: string | null
  payload?: unknown
}

export interface ValidatedEscrowProofUpload {
  type: ProofType
  url: string | null
  payload: ProofPayload | null
}

function fail(message: string): never {
  throw new AppError(400, ErrorCode.VALIDATION_ERROR, message)
}

/**
 * Validate proof shape, class, host, and uploader ownership; returns the
 * NORMALISED batch (payload text trimmed etc.) rather than asserting in
 * place, because normalisation rewrites values.
 */
export function validateEscrowProofUploads(
  proofs: EscrowProofUploadInput[],
  userId: string,
  maxCount?: number,
): ValidatedEscrowProofUpload[] {
  if (maxCount !== undefined && proofs.length > maxCount) {
    fail(`Too many proofs, maximum ${maxCount} allowed per submission`)
  }
  const expectedFolder = `/tenda/proofs/${userId}/`
  return proofs.map((proof) => {
    if (!isProofType(proof.type)) {
      fail(`Proof type must be one of: ${PROOF_TYPES.join(', ')}`)
    }
    if (isDataProofType(proof.type)) {
      if (proof.url != null) {
        fail(`A ${proof.type} proof carries a payload, not a url`)
      }
      const parsed = parseProofPayload(proof.type, proof.payload)
      if (parsed.error !== undefined) fail(parsed.error)
      return { type: proof.type, url: null, payload: parsed.payload }
    }
    if (proof.payload != null) {
      fail(`A ${proof.type} proof carries a url, not a payload`)
    }
    if (typeof proof.url !== 'string' || !isCloudinaryUrl(proof.url)) {
      fail('All proof URLs must be hosted on Cloudinary (https://res.cloudinary.com/)')
    }
    if (!proof.url.includes(expectedFolder)) {
      fail('Proof URL was not uploaded by the submitting user')
    }
    return { type: proof.type, url: proof.url, payload: null }
  })
}
