/**
 * Tenda auth-message BUILDER — the client-side counterpart of the server's
 * parser (`apps/server/src/lib/auth-message.ts`). One canonical format,
 * built here, parsed there; a server unit test round-trips the two so the
 * template can never drift.
 *
 * Canonical format (stage-1-onboarding.md § Auth-message template):
 *   Tenda wants you to sign in with your wallet:
 *   {address}
 *
 *   Chain: {chain_id}          ← CAIP-2 ('solana:mainnet', 'eip155:8453')
 *   URI: {api_base_url}
 *   Nonce: {nonce}
 *   Issued At: {ISO8601}
 *
 * The wallet signs the LITERAL bytes of this string — clients must send the
 * exact same string to POST /v1/auth/verify { method: 'wallet' }.
 */

export interface AuthMessageInput {
  /** Wallet address: base58 (Solana) or 0x-hex (EVM). */
  address: string
  /** CAIP-2 chain id the wallet belongs to. */
  chain_id: string
  /** API base URL of the deployment being signed into (no trailing slash). */
  uri: string
  /** Server-issued nonce from POST /v1/auth/nonce. */
  nonce: string
  /** Signing moment — defaults to now; injectable for deterministic tests. */
  issued_at?: Date
}

export function buildAuthMessage(input: AuthMessageInput): string {
  const issued = (input.issued_at ?? new Date()).toISOString()
  return [
    'Tenda wants you to sign in with your wallet:',
    input.address,
    '',
    `Chain: ${input.chain_id}`,
    `URI: ${input.uri}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${issued}`,
  ].join('\n')
}
