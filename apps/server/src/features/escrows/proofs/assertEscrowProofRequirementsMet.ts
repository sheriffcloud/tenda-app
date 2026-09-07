import { ErrorCode, formatProofTypeList, missingProofTypes, type ProofType } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

/** Refuse submit before transaction construction when required evidence is absent. */
export function assertEscrowProofRequirementsMet(
  required: readonly ProofType[],
  attached: readonly { type: ProofType }[],
): void {
  const missing = missingProofTypes(required, attached)
  if (missing.length === 0) return
  throw new AppError(
    409,
    ErrorCode.PROOF_REQUIREMENT_UNMET,
    `This gig requires ${formatProofTypeList(missing)} proof before you can submit`,
    { missing },
  )
}
