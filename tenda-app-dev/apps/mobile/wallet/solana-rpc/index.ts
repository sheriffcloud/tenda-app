/**
 * Mobile's slice of the Solana RPC stack. The transport itself (retry,
 * failover, recovery, classification) lives in @tenda/shared/wallet/solana-rpc
 * since 2026-08-15 — what stays here is the platform glue: endpoint
 * resolution (Expo env) and the web3.js Connection factory the shared
 * transport is constructed with.
 */
import { Connection } from '@solana/web3.js'
import { createSolanaRpcTransport, type SolanaConnectionPort } from '@tenda/shared'
import { resolveSolanaPublicRpcEndpoints } from './endpoints'

export { resolveSolanaPublicRpcEndpoints } from './endpoints'

/** web3.js glue for the shared transport: 'confirmed' end to end, history-aware reads. */
export function web3ConnectionFactory(endpoint: string): SolanaConnectionPort {
  const connection = new Connection(endpoint, 'confirmed')
  return {
    sendRawTransaction: (raw) => connection.sendRawTransaction(raw, { preflightCommitment: 'confirmed' }),
    getSignatureStatus: (signature) => connection.getSignatureStatus(signature, { searchTransactionHistory: true }),
  }
}

export const solanaRpcTransport = createSolanaRpcTransport(
  resolveSolanaPublicRpcEndpoints(),
  web3ConnectionFactory,
)
