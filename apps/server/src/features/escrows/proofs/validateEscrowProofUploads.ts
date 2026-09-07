import { ErrorCode, isCloudinaryUrl, isProofType, PROOF_TYPES, type ProofType } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

export interface EscrowProofUploadInput {
  url: string
  type: string
}

export interface ValidatedEscrowProofUploadInput extends EscrowProofUploadInput {
  type: ProofType
}

/** Validate proof type, host, uploader ownership, and optional batch size. */
export function validateEscrowProofUploads(
  proofs: EscrowProofUploadInput[],
  userId: string,
  maxCount?: number,
): asserts proofs is ValidatedEscrowProofUploadInput[] {
  if (maxCount !== undefined && proofs.length > maxCount) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR,
      `Too many proofs, maximum ${maxCount} allowed per submission`)
  }
  const expectedFolder = `/tenda/proofs/${userId}/`
  for (const proof of proofs) {
    if (!isProofType(proof.type)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR,
        `Proof type must be one of: ${PROOF_TYPES.join(', ')}`)
    }
    if (!isCloudinaryUrl(proof.url)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR,
        'All proof URLs must be hosted on Cloudinary (https://res.cloudinary.com/)')
    }
    if (!proof.url.includes(expectedFolder)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR,
        'Proof URL was not uploaded by the submitting user')
    }
  }
}
