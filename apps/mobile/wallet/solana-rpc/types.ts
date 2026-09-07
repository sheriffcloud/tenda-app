import type { OnChainTransactionStatus } from '@tenda/shared'

export interface SolanaRpcTransport {
  broadcast(rawTransaction: Uint8Array, signature: string): Promise<string>
  getTransactionStatus(signature: string): Promise<OnChainTransactionStatus>
}

export type SolanaRpcErrorKind =
  | 'transport'
  | 'timeout'
  | 'rate_limited'
  | 'already_processed'
  | 'deterministic'
  | 'unknown'
