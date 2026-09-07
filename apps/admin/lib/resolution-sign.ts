/**
 * Resolve-signing orchestration (Issue-3 C2). Library-agnostic on purpose:
 * the concrete wallet lives behind the WalletSigner seam, so this flow and the
 * reactive match-gating are fully unit-testable with a fake signer; the real
 * (Reown) adapter is the only device-smoke surface.
 *
 * The connected wallet is gated in the UI (SignAction): the panel reads the
 * live connected address, compares it to the chain's configured authority, and
 * only enables signing on a match — so `runResolutionSign` just builds → signs
 * → broadcasts. The server-built tx is fixed to the reviewed winner and the
 * on-chain program rejects a non-authority signer, so signing can't change or
 * mis-route the outcome.
 */
import type { UnsignedTx } from '@tenda/shared'
import { adminApi } from '@/api/client'

export interface WalletSigner {
  /** Current connected address for this chain's namespace, or null. Synchronous. */
  getConnected(chainId: string): string | null
  /** Subscribe to connection/account changes; returns an unsubscribe fn. */
  subscribe(callback: () => void): () => void
  /** Open the wallet modal so the operator can connect or switch accounts. */
  open(chainId: string): Promise<void>
  /** Sign + broadcast the unsigned tx on `chainId`; resolves with the tx ref. */
  signAndBroadcast(chainId: string, unsigned: UnsignedTx): Promise<string>
}

export class UnsupportedChainError extends Error {
  constructor(readonly chainId: string) {
    super(`Unsupported chain: ${chainId}`)
    this.name = 'UnsupportedChainError'
  }
}

/**
 * The build handed back a tx variant the admin wallet can't sign — e.g. a
 * sponsored ERC-4337 user-operation. Resolution builds for a plain dispute-
 * authority EOA are always solana-tx / evm-tx; this guards the unreachable
 * userop case loudly instead of silently mis-signing.
 */
export class UnsupportedTxError extends Error {
  constructor(readonly kind: string) {
    super(`Unsupported transaction kind for admin signing: ${kind}`)
    this.name = 'UnsupportedTxError'
  }
}

/** Build the unsigned resolve tx, sign + broadcast it, then ping the server. */
export async function runResolutionSign(
  resolutionId: string,
  signer: WalletSigner,
): Promise<string> {
  const build = await adminApi.resolutions.executeBuild(resolutionId)
  const tx_ref = await signer.signAndBroadcast(build.chain_id, build.unsigned)
  await adminApi.resolutions.broadcast(resolutionId, tx_ref)
  return tx_ref
}
