/**
 * OIDC id_token verification for Google + Apple sign-in (Stage 9B). Uses
 * `jose` to verify the RS256 signature against the provider JWKS and validate
 * iss / aud / exp. The key source is injected (`createOidcVerifier`) so prod
 * wires a cached remote JWKS while tests wire a local key set, both exercise
 * the SAME signature + claim logic.
 */

import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey, type JWTPayload } from 'jose'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

/** Normalised claims extracted from a verified id_token. */
export interface OidcClaims {
  /** Stable provider subject id, the identity's `identifier`. */
  sub: string
  /** Verified email (lowercased) if the token carries one and it is verified; else null. */
  email: string | null
}

export interface OidcVerifier {
  verify(idToken: string): Promise<OidcClaims>
}

export interface OidcVerifierConfig {
  /** jose key resolver, `createRemoteJWKSet(url)` (prod) or `createLocalJWKSet(jwks)` (test). */
  keys: JWTVerifyGetKey
  /** Accepted issuer(s). */
  issuer: string | string[]
  /** Accepted audiences (our OAuth client IDs). */
  audiences: string[]
}

/** Small leeway for clock skew between us and the provider. */
const CLOCK_TOLERANCE_SECONDS = 30

// Google issues id_tokens under either issuer spelling; Apple uses the https form.
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
export const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs'
export const APPLE_ISSUER = 'https://appleid.apple.com'
export const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys'

export function createOidcVerifier(cfg: OidcVerifierConfig): OidcVerifier {
  return {
    async verify(idToken) {
      let payload: JWTPayload
      try {
        const result = await jwtVerify(idToken, cfg.keys, {
          issuer: cfg.issuer,
          audience: cfg.audiences,
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
          algorithms: ['RS256'],
        })
        payload = result.payload
      } catch {
        // Any failure (bad sig, expired, wrong aud/iss, malformed) → one uniform 401.
        throw new AppError(401, ErrorCode.INVALID_SIGNATURE, 'OAuth token verification failed')
      }
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new AppError(401, ErrorCode.INVALID_SIGNATURE, 'OAuth token is missing a subject')
      }
      return { sub: payload.sub, email: extractVerifiedEmail(payload) }
    },
  }
}

/**
 * Pull a verified email from the token. Google sends `email_verified` as a
 * boolean; Apple sometimes sends the string "true". Only a verified email is
 * returned (it becomes a contact + dedup key); otherwise null.
 */
function extractVerifiedEmail(payload: JWTPayload): string | null {
  const email = payload['email']
  if (typeof email !== 'string' || email.length === 0) return null
  const verified = payload['email_verified']
  const isVerified = verified === true || verified === 'true'
  return isVerified ? email.trim().toLowerCase() : null
}

/** Production Google verifier, remote JWKS is fetched + cached by jose. */
export function googleVerifier(audiences: string[]): OidcVerifier {
  return createOidcVerifier({
    keys: createRemoteJWKSet(new URL(GOOGLE_JWKS_URI)),
    issuer: GOOGLE_ISSUERS,
    audiences,
  })
}

/** Production Apple verifier, remote JWKS is fetched + cached by jose. */
export function appleVerifier(audiences: string[]): OidcVerifier {
  return createOidcVerifier({
    keys: createRemoteJWKSet(new URL(APPLE_JWKS_URI)),
    issuer: APPLE_ISSUER,
    audiences,
  })
}
