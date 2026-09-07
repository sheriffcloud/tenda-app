/**
 * Wallet auth-signature verification, a NAMESPACE-level concern (eip155 =
 * EIP-191 ecrecover, solana = ed25519), NOT a per-chain or per-deployment one.
 *
 * It is pure offline crypto: a wallet proves control of its key without the
 * chain being PROVISIONED on this deployment (no RPC, no deployed escrow
 * contract). So LOGIN works for any supported namespace even when only one
 * chain is configured, escrow signing still needs the provisioned adapter.
 *
 * This is the SINGLE source of the sig crypto: the chain registry's
 * `verifyAuthSig` and the per-chain adapters both delegate here (no duplication).
 */
import { recoverMessageAddress } from 'viem'
import { PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { ErrorCode } from '@tenda/shared'
import type { ChainNamespace } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import type { VerifyAuthSigArgs } from '@server/chains/types'

/** CAIP-2 chain id → namespace; 400 on an unsupported namespace. */
export function deriveChainNamespace(chain_id: string): ChainNamespace {
  const ns = chain_id.split(':')[0]
  if (ns === 'solana' || ns === 'eip155') return ns
  throw new AppError(
    400,
    ErrorCode.VALIDATION_ERROR,
    `chain_id '${chain_id}' has unsupported namespace`,
  )
}

/** EIP-191 personal_sign ECDSA recovery (offline; EOA-only). */
async function verifyEip155(a: VerifyAuthSigArgs): Promise<boolean> {
  try {
    const recovered = await recoverMessageAddress({
      message: a.message,
      signature: a.signature as `0x${string}`,
    })
    return recovered.toLowerCase() === a.address.toLowerCase()
  } catch {
    return false
  }
}

/**
 * Ed25519 over the literal `message` bytes (base64 signature). Returns `false`
 * for any decode failure rather than throwing, callers map `false` to a 401.
 */
export function verifyEd25519(a: VerifyAuthSigArgs): boolean {
  try {
    const pk = new PublicKey(a.address).toBytes()
    const msg = new TextEncoder().encode(a.message)
    const sig = Buffer.from(a.signature, 'base64')
    if (sig.length !== 64) return false
    return nacl.sign.detached.verify(msg, sig, pk)
  } catch {
    return false
  }
}

/** Verify an auth-message signature for the given namespace. */
export function verifyWalletSignature(
  namespace: ChainNamespace,
  args: VerifyAuthSigArgs,
): Promise<boolean> {
  return namespace === 'eip155' ? verifyEip155(args) : Promise.resolve(verifyEd25519(args))
}
