/**
 * Stage 9 unified auth, pluggable strategy contract. Every login method
 * (phone, email, google, apple, wallet) normalises to one `verify` →
 * `VerifyOutcome` shape so the `/auth/challenge` + `/auth/verify` routes stay
 * method-agnostic. Adding a method = register one strategy; routes never
 * change. Wallet is the one method that resolves to `user_wallets` (a
 * transaction capability), hence the `wallet` outcome variant.
 */

import type { ChainNamespace, IdentityKind } from '@tenda/shared/db/schema'
import { AUTH_METHODS, type AuthMethod } from '@tenda/shared'

// `AUTH_METHODS` and `AuthMethod` live in `@tenda/shared` — the agent document
// publishes them (#157) and builds without importing the server. IMPORT THEM
// FROM THERE, as the guard below does; this module owns what a method RESOLVES
// to, not the list itself. They were re-exported here at first, to keep this
// the place the policy was read from; nothing ever read it here (proved by
// deleting the re-export and type-checking src and test), so it was a getter no
// caller invoked. Line comments, not a docblock: a `/** */` here would attach
// itself to the guard and describe the wrong thing on hover.

export function isAuthMethod(value: unknown): value is AuthMethod {
  return typeof value === 'string' && (AUTH_METHODS as readonly string[]).includes(value)
}

/** A proven non-wallet credential. `email` carries the verified address when the method yields one. */
export interface VerifiedIdentity {
  kind: IdentityKind
  identifier: string
  email: string | null
}

/** Result of a successful `verify`. */
export type VerifyOutcome =
  | { type: 'identity'; identity: VerifiedIdentity }
  | { type: 'wallet'; chain_ns: ChainNamespace; address: string }

/** Discriminated proof the route hands a strategy (parsed + shape-checked there). */
export type VerifyProof =
  | { method: 'phone' | 'email'; identifier: string; code: string; user_id: string | null }
  | { method: 'wallet'; chain_id: string; address: string; message: string; signature: string }
  | { method: 'google' | 'apple'; id_token: string }

/** Input to issue a challenge (OTP send). `user_id` is null for pre-account sign-in. */
export interface ChallengeInput {
  identifier: string
  user_id: string | null
}

/** Outcome of a challenge, OTP channels report `expires_in`; others omit it. */
export interface ChallengeOutcome {
  expires_in?: number
}

export interface AuthStrategy {
  readonly method: AuthMethod
  /**
   * Issue a challenge. Present only for methods that challenge server-side
   * (phone/email OTP). Wallet challenges via POST /auth/nonce and OAuth via
   * the native SDK, so they omit this.
   */
  challenge?(input: ChallengeInput): Promise<ChallengeOutcome>
  /** Validate the client's proof → outcome, or throw an AppError. */
  verify(proof: VerifyProof): Promise<VerifyOutcome>
}

/** The strategy set is partial, methods not yet wired (e.g. OAuth pre-9B) are absent. */
export type AuthStrategyRegistry = Partial<Record<AuthMethod, AuthStrategy>>
