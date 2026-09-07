/**
 * OAuth (Google / Apple) auth strategy, one factory for both providers; they
 * differ only in which verifier (issuer + JWKS + audiences) is injected. The
 * native SDK challenges on-device, so there is no server `challenge`.
 */

import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { OidcVerifier } from '@server/lib/auth/oidc'
import type { AuthStrategy, VerifyOutcome, VerifyProof } from '@server/lib/auth/strategy'

export function oauthStrategy(kind: 'google' | 'apple', verifier: OidcVerifier): AuthStrategy {
  return {
    method: kind,
    async verify(proof: VerifyProof): Promise<VerifyOutcome> {
      if (proof.method !== 'google' && proof.method !== 'apple') {
        throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'oauth strategy received a non-oauth proof')
      }
      const claims = await verifier.verify(proof.id_token)
      return {
        type: 'identity',
        // `sub` is the stable per-provider id; the verified email (if any) rides
        // along for cross-method dedup + the contact gate. Apple omits email
        // after the first authorization, that's fine, the sub is the key.
        identity: { kind, identifier: claims.sub, email: claims.email },
      }
    },
  }
}
