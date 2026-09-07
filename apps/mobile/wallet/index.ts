/**
 * Chain-agnostic wallet utilities (post-#34). Wallet CONNECTIONS live in
 * the promoted adapter stack (adapters/* behind the WalletAdapter interface);
 * sign-in/link orchestration lives in auth.ts; unsigned-tx signing +
 * client-ping live in dispatch.ts. This module owns the Solana RPC helpers
 * (getBalance / getTransactionStatus) and re-exports the single-source chain
 * config + error type as a convenience surface (the canonical homes are
 * ./config and ./errors, prefer those in new code to avoid the native pull).
 *
 * The legacy MWA + idl/legacy escrow flow died at the cutover, escrow
 * transactions are built server-side (/v1/escrows) and signed via
 * dispatch.signSendAndReport.
 */
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js'
import type { OnChainTransactionStatus } from '@tenda/shared'
import { SOLANA_NETWORK } from './config'
import { solanaRpcTransport } from './solana-rpc'

// Re-export the single-source chain config (wallet/config.ts) and the wallet
// error type (wallet/errors.ts) so barrel consumers keep importing from
// '@/wallet'.
export { SOLANA_NETWORK, WALLET_CHAINS } from './config'
export { WalletError, type WalletErrorCode } from './errors'

const connection = new Connection(clusterApiUrl(SOLANA_NETWORK), 'confirmed')

export async function getBalance(publicKey: PublicKey): Promise<number> {
  return connection.getBalance(publicKey)
}

/** Token-amount shape inside a parsed SPL token account (web3.js types it `any`). */
interface ParsedSplAmount {
  info?: { tokenAmount?: { amount?: string } }
}

/**
 * Total SPL-token balance (base units, as a string) an owner holds of `mint`,
 * summed across all their token accounts for that mint. 0 when none exist.
 * Drives the wallet screen's USDC reading on Solana.
 */
export async function getSplTokenBalance(owner: PublicKey, mint: PublicKey): Promise<string> {
  const { value } = await connection.getParsedTokenAccountsByOwner(owner, { mint })
  let total = 0n
  for (const { account } of value) {
    const amount = (account.data.parsed as ParsedSplAmount).info?.tokenAmount?.amount
    if (typeof amount === 'string') total += BigInt(amount)
  }
  return total.toString()
}

export { getEvmTransactionStatus } from '@/wallet/adapters/walletconnect'

// Guarded-request surface: lets UI (TransactionMonitor's Cancel) observe and
// abort an in-flight WalletConnect request without touching the reown stack.
export {
  abortPendingWalletRequest,
  hasPendingWalletRequest,
  subscribePendingWalletRequest,
} from './reown/request-guard'

export type OnChainTxStatus = OnChainTransactionStatus

export async function getTransactionStatus(signature: string): Promise<OnChainTxStatus> {
  return solanaRpcTransport.getTransactionStatus(signature)
}
