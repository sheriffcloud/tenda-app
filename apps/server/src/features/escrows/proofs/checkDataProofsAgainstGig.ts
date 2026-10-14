/**
 * Check DATA proofs against the gig's declared params, at ADD time — the
 * worker learns immediately, and the submit gate stays purely type-presence.
 *
 * The vocabulary is deliberate (see the class doc in shared/constants/proofs):
 * geotag is VERIFIED (a geometric fact against the declared radius),
 * structured is CONFORMANCE-checked (shape against declared fields — whether
 * the values are TRUE stays with the poster and the dispute flow), text has
 * nothing to check here. A check only exists where the gig declared params:
 * a data proof volunteered on a gig that never asked for it (or on an
 * exchange escrow, which has no gig row) has nothing to be checked against
 * and is accepted as-is.
 */
import {
  ErrorCode,
  haversineDistanceMeters,
  structuredValuesProblem,
  type ProofParams,
} from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { ValidatedEscrowProofUpload } from './validateEscrowProofUploads'

export interface GigProofContext {
  proof_params: ProofParams | null
  latitude: number | null
  longitude: number | null
}

function refuse(message: string): never {
  throw new AppError(400, ErrorCode.PROOF_CHECK_FAILED, message)
}

export function checkDataProofsAgainstGig(
  proofs: readonly ValidatedEscrowProofUpload[],
  gig: GigProofContext | null,
): void {
  const geotagParams = gig?.proof_params?.geotag
  const structuredParams = gig?.proof_params?.structured

  for (const proof of proofs) {
    if (
      proof.type === 'geotag' &&
      proof.payload !== null &&
      'latitude' in proof.payload &&
      geotagParams !== undefined &&
      gig?.latitude != null &&
      gig.longitude != null
    ) {
      const distance = haversineDistanceMeters(
        gig.latitude,
        gig.longitude,
        proof.payload.latitude,
        proof.payload.longitude,
      )
      if (distance > geotagParams.radius_m) {
        refuse(
          `Location is ${Math.round(distance)} m from the gig — this gig requires within ${geotagParams.radius_m} m`,
        )
      }
    }
    if (
      proof.type === 'structured' &&
      proof.payload !== null &&
      'values' in proof.payload &&
      structuredParams !== undefined
    ) {
      const problem = structuredValuesProblem(structuredParams.fields, proof.payload.values)
      if (problem !== null) refuse(problem)
    }
  }
}
