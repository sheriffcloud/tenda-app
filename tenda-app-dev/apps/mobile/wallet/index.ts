/**
 * Chain-agnostic wallet utilities (post-#34). Wallet CONNECTIONS live in
 * the promoted adapter stack (adapters/* behind the WalletAdapter interface);
 * sign-in/link orchestration lives in auth.ts; unsigned-tx signing +
 * client-ping live in dispatch.ts. Balance READS converged onto
 * @tenda/shared's fetch-based readers (2026-08-15) — the web3.js Connection
 * this module used to construct at import time is gone with them. This
 * module re-exports the single-source chain config and owns the Solana tx
 * status read (the canonical homes are ./config and ./solana-rpc, prefer
 * those in new code).
 *
 * The legacy MWA + idl/legacy escrow flow died at the cutover, escrow
 * transactions are built server-side (/v1/escrows) and signed via
 * dispatch.signSendAndReport.
 */
import type { OnChainTransactionStatus } from '@tenda/shared'
import { solanaRpcTransport } from './solana-rpc'

// Re-export the single-source chain config (wallet/config.ts) so barrel
// consumers keep importing from '@/wallet'. WalletError moved to
// @tenda/shared (2026-08-15) — import it from there.
export { SOLANA_NETWORK, WALLET_CHAINS } from './config'



export type OnChainTxStatus = OnChainTransactionStatus

export async function getTransactionStatus(signature: string): Promise<OnChainTxStatus> {
  return solanaRpcTransport.getTransactionStatus(signature)
}
