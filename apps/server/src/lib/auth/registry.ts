/**
 * Build the per-request auth strategy set from the Fastify context. OTP +
 * wallet strategies are cheap/stateless and built per call; the OAuth
 * verifiers wrap a remote JWKS whose cache lives INSIDE the verifier, so they
 * are built ONCE (module-level memo) and reused, rebuilding per request would
 * defeat jose's JWKS cache and re-fetch provider keys on every sign-in.
 *
 * A provider with no configured audiences is simply absent from the registry;
 * the routes then answer UNSUPPORTED_AUTH_METHOD for it.
 */

import type { FastifyInstance } from 'fastify'
import { getConfig } from '@server/config'
import { buildOtpDeps } from '@server/lib/onboarding-deps'
import { otpStrategy } from '@server/lib/auth/strategies/otp'
import { walletStrategy } from '@server/lib/auth/strategies/wallet'
import { oauthStrategy } from '@server/lib/auth/strategies/oauth'
import { googleVerifier, appleVerifier, type OidcVerifier } from '@server/lib/auth/oidc'
import type { AuthStrategy, AuthStrategyRegistry } from '@server/lib/auth/strategy'

interface OauthStrategies {
  google?: AuthStrategy
  apple?: AuthStrategy
}

let _oauth: OauthStrategies | undefined

/** Build (once) the OAuth strategies for whichever providers are configured. */
function oauthStrategies(): OauthStrategies {
  if (_oauth === undefined) {
    const config = getConfig()
    _oauth = {}
    if (config.GOOGLE_OAUTH_CLIENT_IDS !== null) {
      const v: OidcVerifier = googleVerifier(config.GOOGLE_OAUTH_CLIENT_IDS)
      _oauth.google = oauthStrategy('google', v)
    }
    if (config.APPLE_OAUTH_CLIENT_IDS !== null) {
      const v: OidcVerifier = appleVerifier(config.APPLE_OAUTH_CLIENT_IDS)
      _oauth.apple = oauthStrategy('apple', v)
    }
  }
  return _oauth
}

export function buildAuthStrategies(fastify: FastifyInstance): AuthStrategyRegistry {
  const otpDeps = buildOtpDeps(fastify)
  const oauth = oauthStrategies()
  return {
    phone: otpStrategy('phone', otpDeps),
    email: otpStrategy('email', otpDeps),
    wallet: walletStrategy({ chains: fastify.chains, db: fastify.db, now: () => new Date() }),
    ...(oauth.google !== undefined ? { google: oauth.google } : {}),
    ...(oauth.apple !== undefined ? { apple: oauth.apple } : {}),
  }
}
