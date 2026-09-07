import type { OnChainTransactionStatus } from '../types/transaction'

export interface SolanaSignatureStatusValue {
  err: unknown | null
  confirmationStatus?: string | null
}

/** Map Solana's signature-status response into the chain-neutral client state. */
export function resolveSolanaTransactionStatus(
  value: SolanaSignatureStatusValue | null,
): OnChainTransactionStatus {
  if (value === null) return 'not_found'
  if (value.err !== null) return 'failed'
  if (value.confirmationStatus === 'finalized') return 'finalized'
  if (value.confirmationStatus === 'confirmed') return 'confirmed'
  return 'not_found'
}
