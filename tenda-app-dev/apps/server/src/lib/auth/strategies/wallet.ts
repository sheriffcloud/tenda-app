/**
 * Wallet auth strategy, verifies a server-nonce signature and resolves to a
 * wallet outcome. The verify-message-and-signature flow is extracted here
 * (`verifyWalletAuth`) so the /auth/link-wallet route and this strategy share
 * ONE implementation instead of duplicating the nonce/sig logic.
 *
 * Decision #3: wallet signs in but never creates, the find-or-reject lives
 * in the orchestrator; this strategy only proves control of the wallet.
 */

import type { ChainNamespace } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { drizzleNonceStore, consumeNonce } from '@server/lib/nonce'
import { assertAuthMessage, parseAuthMessage, expectedAuthUri } from '@server/lib/auth-message'
import { deriveChainNamespace } from '@server/lib/wallet-signature'
import { normalizeWalletAddress } from '@server/lib/auth/wallet-address'
import type { ChainRegistry } from '@server/chains/types'
import type { AppDatabase } from '@server/plugins/db'
import type { AuthStrategy, VerifyOutcome, VerifyProof } from '@server/lib/auth/strategy'

export interface WalletAuthDeps {
  chains: ChainRegistry
  db: AppDatabase
  now(): Date
}

export interface WalletAuthInput {
  chain_id: string
  address: string
  message: string
  signature: string
}

/**
 * Verify a wallet's server-nonce signature: parse + validate the auth message,
 * verify the signature (CPU work, no side effect on failure, BEFORE nonce
 * consumption so an observed nonce can't be burned with a garbage sig), then
 * single-use-consume the nonce. Returns the proven (chain_ns, address).
 */
export async function verifyWalletAuth(
  deps: WalletAuthDeps,
  input: WalletAuthInput,
): Promise<{ chain_ns: ChainNamespace; address: string }> {
  const parsed = parseAuthMessage(input.message)
  assertAuthMessage({
    parsed,
    expected_chain_id: input.chain_id,
    expected_address: input.address,
    expected_uri: expectedAuthUri(),
    now: deps.now(),
  })

  // Namespace gate (400 on an unsupported namespace). Login does NOT require the
  // chain to be PROVISIONED on this deployment, proving key control is pure
  // offline crypto (verifyAuthSig dispatches by namespace, no escrow/RPC needed).
  const chain_ns = deriveChainNamespace(input.chain_id)
  const sigOk = await deps.chains.verifyAuthSig(input.chain_id, {
    address: input.address,
    message: input.message,
    signature: input.signature,
  })
  if (!sigOk) {
    throw new AppError(401, ErrorCode.INVALID_SIGNATURE, 'wallet signature did not verify')
  }

  await consumeNonce(drizzleNonceStore(deps.db), parsed.nonce)
  // Canonicalise before the address reaches storage/lookup so a checksummed and
  // a lowercased form of the same EVM wallet resolve to ONE row (link + login).
  return { chain_ns, address: normalizeWalletAddress(chain_ns, input.address) }
}

export function walletStrategy(deps: WalletAuthDeps): AuthStrategy {
  return {
    method: 'wallet',
    async verify(proof: VerifyProof): Promise<VerifyOutcome> {
      if (proof.method !== 'wallet') {
        throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'wallet strategy received a non-wallet proof')
      }
      const { chain_ns, address } = await verifyWalletAuth(deps, proof)
      return { type: 'wallet', chain_ns, address }
    },
  }
}
