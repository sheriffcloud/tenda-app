/**
 * Bootstrap schemas (#130): what `POST /v1/auth/nonce` answers and what
 * `POST /v1/auth/verify` takes.
 *
 * WHY THEY EXIST AT ALL. `POST /v1/agent/register` has always instructed the
 * reader to "POST /v1/auth/nonce, sign the auth message with the agent's key"
 * and to use "/v1/auth/verify with method 'wallet'" to sign back in — two
 * paths that neither this document nor the canonical one defined. The demo
 * bearer (#108) hid the cost, because a reader with no wallet never needs
 * either. A reader WITH a wallet needs both before anything else, and on
 * 2026-09-07 a reviewer stopped there and said so: the flow it could not start
 * was the only flow that posts work a person can actually be paid for.
 *
 * DERIVED, LIKE EVERY SIBLING. `AuthNonceResponse` and `VerifyBody` are the
 * shared wire types the routes already answer and accept, so `closedFor` holds
 * both schemas to their exact keys — a field either type gains fails the build
 * rather than a reader. Nothing here is a second description of the wire.
 *
 * The 200 of BOTH operations is `AgentRegisterResponse`, not a new component:
 * `VerifyResponse` and `AgentRegisterResponse` are the same
 * `{ token, user, is_new }`, and registration's schema is already registered.
 */
import {
  type AuthNonceResponse,
  type VerifyBody,
  AUTH_METHODS,
  NONCE_FORMAT,
  NONCE_TTL_SECONDS,
} from '@tenda/shared'
import { WALLET_PROOF } from './schemas-agent'
import { COUNTRY_CODES } from './scalars'
import { allKeys, closedFor, nullable, type AuthComponentName, type SchemaObject } from './schema-types'

const AUTH_NONCE_PROPERTIES: Readonly<Record<keyof AuthNonceResponse, SchemaObject>> = {
  nonce: {
    type: 'string',
    pattern: NONCE_FORMAT.source,
    description: 'Single-use. Goes into the auth message\'s `Nonce:` line verbatim',
  },
  expires_in: {
    type: 'integer',
    description: `Seconds until it expires (${NONCE_TTL_SECONDS}). Spent or expired, it is refused — ask for another`,
  },
  issued_at: {
    type: 'string',
    description:
      'ISO-8601. Echo it into the `Issued At:` line — the server checks it against its own clock, so do not invent one',
  },
}

const authNonce: SchemaObject = closedFor<AuthNonceResponse>(
  AUTH_NONCE_PROPERTIES,
  allKeys<AuthNonceResponse>(AUTH_NONCE_PROPERTIES),
  'A nonce to sign over. No body, no auth, no account needed.',
)

/**
 * The verify body is METHOD-DEPENDENT and documented whole, because that is
 * the type the route actually accepts. An agent uses exactly one method —
 * `wallet` — and the four fields it needs are the same `WALLET_PROOF` that
 * registration takes, imported rather than restated.
 */
const authVerifyBody: SchemaObject = closedFor<VerifyBody>(
  {
    method: {
      type: 'string',
      enum: AUTH_METHODS,
      description: 'Agents use `wallet`. The others are the human sign-in methods and need no key',
    },
    ...WALLET_PROOF,
    identifier: { type: 'string', description: 'phone/email only: the number or address' },
    code: { type: 'string', description: 'phone/email only: the OTP' },
    id_token: { type: 'string', description: 'google/apple only' },
    is_seeker: { type: 'boolean', description: 'Bootstraps a NEW account only; ignored signing an existing one in' },
    country: nullable({ type: 'string', enum: COUNTRY_CODES, description: 'Bootstraps a NEW account only' }),
  },
  ['method'],
  'Sign in by proof. With `method: "wallet"` the proof is the auth message and its signature; a bearer on the request LINKS the identity to that account instead of signing in.',
)

export const AUTH_SCHEMAS: Readonly<Record<AuthComponentName, SchemaObject>> = {
  AuthNonce: authNonce,
  AuthVerifyBody: authVerifyBody,
}
