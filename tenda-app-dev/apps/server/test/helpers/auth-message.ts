/**
 * Shared wallet-auth test helpers — the server-nonce + signed-message flow
 * used by BOTH /v1/auth/verify { method: 'wallet' } (login) and
 * /v1/auth/link-wallet. Kept here so
 * the two suites don't each re-implement the message format (one source of
 * truth for the Chain/URI/Nonce/Issued-At envelope `parseAuthMessage` reads).
 */
import assert from 'node:assert'
import type { FastifyInstance } from 'fastify'
import { TEST_CHAIN_ID } from './test-app'

/** = API_BASE_URL stubbed by the harness (test-app env stubs). */
export const AUTH_URI = 'https://api.tenda.test'

/** Issue a fresh single-use nonce via the real route. */
export async function issueNonce(
  app: FastifyInstance,
): Promise<{ nonce: string; issued_at: string }> {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/nonce' })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  return { nonce: body.nonce, issued_at: body.issued_at }
}

/** Build the signed-message envelope exactly as `parseAuthMessage` expects. */
export function buildAuthMessage(opts: {
  address: string
  chain_id?: string
  uri?: string
  nonce: string
  issued_at: string
}): string {
  return [
    'Tenda wants you to sign in with your wallet:',
    opts.address,
    '',
    `Chain: ${opts.chain_id ?? TEST_CHAIN_ID}`,
    `URI: ${opts.uri ?? AUTH_URI}`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issued_at}`,
  ].join('\n')
}
