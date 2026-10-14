/**
 * The relayed-funding (x402) protocol constants an agent integrates against.
 *
 * Tenda's relayer speaks the x402 ENVELOPE — a 402 body listing what is
 * accepted, an `X-PAYMENT` header carrying one signed payment artifact, an
 * `X-PAYMENT-RESPONSE` header reporting the settlement — with a scheme of its
 * own: the artifact does not pay a `payTo` account, it funds an escrow the
 * signer created, so the terms carry the escrow's exact create parameters and
 * the artifact is bound to them (EVM: the EIP-3009 nonce is the hash of the
 * whole CreateParams; Solana: the artifact IS the create transaction).
 */

/** The x402 protocol version the envelope declares. */
export const X402_VERSION = 1 as const

/** Request header carrying the base64 JSON `RelayPaymentPayload`. */
export const X_PAYMENT_HEADER = 'x-payment'
/** Response header carrying the base64 JSON `RelaySettlementResponse`. */
export const X_PAYMENT_RESPONSE_HEADER = 'x-payment-response'

/** The scheme id of Tenda's terms — never x402's `exact`, which pays an account. */
export const TENDA_RELAY_SCHEME = 'tenda-escrow-create' as const

/**
 * How long a quote's terms stay signable. On EVM this is the authorization's
 * `validBefore`; the relayer refuses an artifact whose remaining window is
 * shorter than the relay itself needs (`RELAY_MIN_REMAINING_SECONDS`), so a
 * signature never lands one block after it expired.
 */
export const RELAY_QUOTE_TTL_SECONDS = 10 * 60
export const RELAY_MIN_REMAINING_SECONDS = 30

/** The 402 `error` line — the same sentence on every x402 surface Tenda serves. */
export const RELAY_PAYMENT_REQUIRED_MESSAGE =
  'payment required: sign the terms in `accepts` and resend with an X-PAYMENT header'

/** The two payment artifacts the scheme accepts, discriminated by namespace. */
export const RELAY_PAYMENT_KINDS = ['eip155-authorization', 'solana-transaction'] as const
export type RelayPaymentKind = (typeof RELAY_PAYMENT_KINDS)[number]
