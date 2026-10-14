/**
 * Canonical connected-wallet account types, shared by every client's
 * `WalletAdapter` implementations (moved from apps/mobile/wallet/types.ts,
 * 2026-08-15 — the "spike" naming retired with the move: SpikeAccount is now
 * WalletAccount). The adapter INTERFACES stay per-client (mobile's carries
 * RN concerns like bundled icons and deeplink install checks); only the
 * platform-neutral account/result shapes live here.
 */
import type { ChainNamespace } from '../db/schema/chains'

export interface WalletAccount {
  /** Full CAIP-2 chain ID, e.g. `eip155:84532` or `solana:devnet`. */
  chainId: string
  namespace: ChainNamespace
  /** Plain address: hex for EVM, base58 for Solana. */
  address: string
  /** Wallet entry the user picked at connect time. */
  walletId: string
}

export interface SignMessageResult {
  /** Hex (`0x…`) for EVM, base58/base64 per transport for Solana. */
  signature: string
  message: string
}

/**
 * Outcome of a wallet authentication round-trip (connect + prove ownership
 * by signing the server nonce message). `null` is reserved for a
 * user-decline; transport/server failures throw.
 */
export interface AuthenticateResult {
  /** The wallet account that connected + signed. */
  account: WalletAccount
  /** Signature over `message`, in the encoding the server expects per chain:
   *  base64 (Solana) / `0x`-hex (EVM). */
  signature: string
  /** The exact literal message string that was signed. */
  message: string
}
