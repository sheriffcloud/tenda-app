/**
 * Tenda auth-message parser + validator. Per stage-1-onboarding.md L252-263:
 * a custom single-format template across chains (resembles SIWS/SIWE but
 * matches neither's strict spec).
 *
 * Canonical format:
 *   Tenda wants you to sign in with your wallet:
 *   {address}
 *
 *   Chain: {chain_id}          ← CAIP-2 ('solana:mainnet', 'eip155:8453')
 *   URI: {api_base_url}
 *   Nonce: {nonce}
 *   Issued At: {ISO8601}
 *
 * The signature is over the LITERAL bytes of the message, clients must send
 * exactly what was signed. Parsing is by line prefix; field order is
 * documented but not strictly enforced (clients could shuffle), so we look
 * up each line by prefix rather than positionally.
 */

import { AppError } from '@server/lib/errors'
import { getConfig } from '@server/config'
import { ErrorCode } from '@tenda/shared'

export interface AuthMessageFields {
  address: string
  chain_id: string
  uri: string
  nonce: string
  issued_at: Date
}

/**
 * The auth-message URI to enforce (`assertAuthMessage`'s `expected_uri`), or
 * `undefined` to skip the binding.
 *
 * The URI binding is a cross-DEPLOYMENT replay defense: it stops a signature
 * minted for one deployment being replayed against another. It only holds when
 * the client signs with the same origin the server calls itself. That's true in
 * production/staging (both point at the public API URL), but NOT in local dev:
 * a physical device must reach the dev server over the host's LAN IP
 * (`EXPO_PUBLIC_API_URL`), which can never equal the server's `API_BASE_URL`
 * (`localhost`). So enforce only in production; matches the repo's dev
 * convention (`NODE_ENV !== 'production'`, see server.ts / admin-otp.ts).
 */
export function expectedAuthUri(): string | undefined {
  return process.env.NODE_ENV === 'production' ? getConfig().API_BASE_URL : undefined
}

/** Maximum clock skew allowed between client `Issued At` and server now. */
export const AUTH_MESSAGE_MAX_AGE_SECONDS = 60

/**
 * Parse the four header fields out of an auth message. Returns the raw
 * fields without semantic validation, callers run additional checks
 * (address vs claimed-signer, chain match, nonce freshness, age).
 *
 * Throws `VALIDATION_ERROR` on a missing or malformed field.
 */
export function parseAuthMessage(message: string): AuthMessageFields {
  const lines = message.split('\n')

  // Line 2 (after the greeting): the wallet address.
  // We look for it by position rather than prefix because addresses don't
  // have a stable prefix across chains (0x... vs base58).
  const greetingIdx = lines.findIndex((l) =>
    l.startsWith('Tenda wants you to sign in with your wallet'),
  )
  if (greetingIdx === -1 || greetingIdx + 1 >= lines.length) {
    throw validationError('missing greeting / wallet line')
  }
  const address = (lines[greetingIdx + 1] ?? '').trim()
  if (address.length === 0) throw validationError('empty wallet address')

  const chain_id = requirePrefix(lines, 'Chain: ')
  const uri = requirePrefix(lines, 'URI: ')
  const nonce = requirePrefix(lines, 'Nonce: ')
  const issuedRaw = requirePrefix(lines, 'Issued At: ')
  const issued_at = new Date(issuedRaw)
  if (Number.isNaN(issued_at.getTime())) {
    throw validationError(`unparseable Issued At: ${issuedRaw}`)
  }

  return { address, chain_id, uri, nonce, issued_at }
}

/**
 * Validate parsed fields against expected runtime state. Throws on:
 *   - chain_id mismatch (signed for a different network)
 *   - address mismatch (signed by a different wallet than claimed)
 *   - issued_at outside [now - max_age, now + max_age]
 *
 * Nonce-freshness is enforced separately by `lib/nonce.ts:consumeNonce`,
 * this function doesn't touch the DB.
 */
export function assertAuthMessage(args: {
  parsed: AuthMessageFields
  expected_chain_id: string
  expected_address: string
  /**
   * Server's own URI. Cross-deployment replay defense per
   * stage-1-onboarding.md L263. When omitted, URI is parsed but not
   * validated, useful for tests; production routes always pass it.
   */
  expected_uri?: string
  now: Date
}): void {
  const { parsed, expected_chain_id, expected_address, expected_uri, now } = args

  if (parsed.chain_id !== expected_chain_id) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `auth message signed for chain '${parsed.chain_id}'; endpoint expects '${expected_chain_id}'`,
    )
  }

  if (expected_uri !== undefined && parsed.uri !== expected_uri) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `auth message URI '${parsed.uri}' does not match expected '${expected_uri}'`,
    )
  }

  if (parsed.address !== expected_address) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `auth message wallet '${parsed.address}' does not match request address '${expected_address}'`,
    )
  }

  const ageMs = now.getTime() - parsed.issued_at.getTime()
  const maxMs = AUTH_MESSAGE_MAX_AGE_SECONDS * 1000
  if (ageMs > maxMs || ageMs < -maxMs) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `auth message age ${Math.round(ageMs / 1000)}s outside ±${AUTH_MESSAGE_MAX_AGE_SECONDS}s window`,
    )
  }
}

// ---------- internals ---------------------------------------------------

function requirePrefix(lines: string[], prefix: string): string {
  const line = lines.find((l) => l.startsWith(prefix))
  if (line === undefined) {
    throw validationError(`missing '${prefix.trimEnd()}' line in auth message`)
  }
  return line.slice(prefix.length).trim()
}

function validationError(detail: string): AppError {
  return new AppError(400, ErrorCode.VALIDATION_ERROR, `auth message: ${detail}`)
}
