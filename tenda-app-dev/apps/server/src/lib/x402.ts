/**
 * The x402 envelope codec: the `X-PAYMENT` request header is base64 JSON of a
 * `RelayPaymentPayload`, the `X-PAYMENT-RESPONSE` header base64 JSON of a
 * `RelaySettlementResponse`. This module owns the HEADER SHAPE only — whether
 * the artifact inside matches the terms is the adapter's judgement
 * (RELAY_REJECTED); a header that is not the envelope at all is a plain 400.
 */
import {
  ErrorCode,
  TENDA_RELAY_SCHEME,
  X402_VERSION,
  type EvmAuthorizationPayment,
  type RelayPaymentPayload,
  type RelaySettlementResponse,
} from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { isRecord } from '@server/lib/validation'

function malformed(reason: string): never {
  throw new AppError(400, ErrorCode.VALIDATION_ERROR, `X-PAYMENT header ${reason}`)
}

/**
 * The ONE refusal of a payment artifact — every adapter check (envelope,
 * terms, signature, window, simulation) throws through here, so a client
 * sees one status, one code and one `details.reason` shape for all of them.
 */
export function relayRejected(reason: string): never {
  throw new AppError(422, ErrorCode.RELAY_REJECTED, `payment refused: ${reason}`, { reason })
}

/** One string field of the authorization, or the 400 that names it. */
function authorizationField(a: Record<string, unknown>, field: keyof EvmAuthorizationPayment['authorization']): string {
  const v = a[field]
  if (typeof v !== 'string') return malformed(`payload.authorization.${field} must be a string`)
  return v
}

/** The two artifact shapes, each field typed by inspection — never by cast. */
function parsePayload(p: Record<string, unknown>): RelayPaymentPayload['payload'] {
  if (typeof p.transaction === 'string') return { transaction: p.transaction }
  if (typeof p.signature === 'string' && isRecord(p.authorization)) {
    const a = p.authorization
    return {
      signature: p.signature,
      authorization: {
        from: authorizationField(a, 'from'),
        to: authorizationField(a, 'to'),
        value: authorizationField(a, 'value'),
        validAfter: authorizationField(a, 'validAfter'),
        validBefore: authorizationField(a, 'validBefore'),
        nonce: authorizationField(a, 'nonce'),
      },
    }
  }
  return malformed('payload must be an EIP-3009 authorization or a partially signed transaction')
}

/** Decode the header, or undefined when the request carries none (→ 402). */
export function decodePaymentHeader(raw: string | string[] | undefined): RelayPaymentPayload | undefined {
  if (raw === undefined) return undefined
  if (Array.isArray(raw)) malformed('must be sent once')
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    return malformed('must be base64-encoded JSON')
  }
  if (!isRecord(parsed)) malformed('must decode to an object')
  const { x402Version, scheme, network, payload } = parsed
  if (x402Version !== X402_VERSION) malformed(`must declare x402Version ${X402_VERSION}`)
  if (typeof scheme !== 'string' || scheme === '') malformed('must name a scheme')
  if (typeof network !== 'string' || network === '') malformed('must name a network')
  if (!isRecord(payload)) malformed('must carry a payload object')
  // A foreign scheme is a well-formed envelope we do not accept (422 in the
  // adapter), not a malformed one (400) — so it passes here as a string.
  return { x402Version: X402_VERSION, scheme, network, payload: parsePayload(payload) }
}

/**
 * The envelope-level checks every adapter runs first — version, scheme,
 * network — so neither namespace can drift on what a foreign artifact gets.
 */
export function assertRelayEnvelope(payment: RelayPaymentPayload, network: string): void {
  if (payment.x402Version !== X402_VERSION) relayRejected(`x402Version must be ${X402_VERSION}`)
  if (payment.scheme !== TENDA_RELAY_SCHEME) relayRejected(`scheme must be ${TENDA_RELAY_SCHEME}`)
  if (payment.network !== network) relayRejected(`network must be ${network}`)
}

export function encodeSettlementHeader(settlement: RelaySettlementResponse): string {
  return Buffer.from(JSON.stringify(settlement), 'utf8').toString('base64')
}
