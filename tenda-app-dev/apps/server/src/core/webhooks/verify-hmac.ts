/**
 * Shared HMAC-signature verification for inbound provider webhooks
 * (Helius, Alchemy, Yellow Card, Onramp.money, ...).
 *
 * Single source of truth, referenced by stage-0 exit criteria
 * ("core/webhooks/verify-hmac.ts exists and is the only HMAC implementation").
 *
 * Uses Node's `timingSafeEqual` so a leaked signature can't be guessed
 * byte-by-byte via timing oracle.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export type HmacAlgorithm = 'sha256' | 'sha512'

/**
 * `'base64'`, strict standard alphabet (`A-Za-z0-9+/=`). Stripe-class APIs.
 * `'base64url'`, URL-safe alphabet (`A-Za-z0-9-_=`). Some JWT-adjacent
 * providers. NOT mixed, strict per-mode validation so Buffer.from never
 * silently truncates on an unexpected character.
 */
export type SignatureEncoding = 'hex' | 'base64' | 'base64url'

/** Upper bound on payload bytes. 1 MiB is well above any sane webhook body. */
export const MAX_PAYLOAD_BYTES = 1_048_576

export interface VerifyHmacArgs {
  /** Raw request body bytes, never the parsed JSON. */
  payload: string | Buffer
  /** Signature header as provider sent it. */
  signature: string
  /** Shared secret from provider config. */
  secret: string
  algorithm?: HmacAlgorithm
  /** Provider's encoding. Helius/Alchemy use hex; others vary. */
  encoding?: SignatureEncoding
}

export function verifyHmac({
  payload,
  signature,
  secret,
  algorithm = 'sha256',
  encoding = 'hex',
}: VerifyHmacArgs): boolean {
  const payloadLen = typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length
  if (payloadLen > MAX_PAYLOAD_BYTES) return false
  const expected = createHmac(algorithm, secret).update(payload).digest()
  const provided = decodeSignature(signature, encoding)
  if (!provided) return false
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

function decodeSignature(sig: string, encoding: SignatureEncoding): Buffer | null {
  switch (encoding) {
    case 'hex':
      return safeFromHex(sig)
    case 'base64':
      return safeFromBase64Standard(sig)
    case 'base64url':
      return safeFromBase64Url(sig)
  }
}

function safeFromHex(hex: string): Buffer | null {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) return null
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null
  return Buffer.from(cleaned, 'hex')
}

function safeFromBase64Standard(b64: string): Buffer | null {
  if (b64.length === 0) return null
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null
  return Buffer.from(b64, 'base64')
}

function safeFromBase64Url(b64: string): Buffer | null {
  if (b64.length === 0) return null
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(b64)) return null
  // Buffer.from('base64') only handles the standard alphabet, translate first.
  const standard = b64.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(standard, 'base64')
}
