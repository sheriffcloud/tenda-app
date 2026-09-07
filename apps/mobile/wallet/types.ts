/**
 * Unified surface the wallet spike validates.
 *
 * If this proves out across Solana + EVM on Android and iOS, the same shape
 * becomes the top-level `WalletProvider` interface in `wallet/index.ts`.
 */

export type Namespace = 'eip155' | 'solana'

export interface SpikeAccount {
  /** Full CAIP-2 chain ID, e.g. `eip155:84532` or `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`. */
  chainId: string
  namespace: Namespace
  /** Plain address: hex for EVM, base58 for Solana. */
  address: string
  /** Wallet entry the user picked at connect time. */
  walletId: string
}

export interface SignMessageResult {
  /** Hex (`0x…`) for EVM, base58 for Solana. */
  signature: string
  message: string
}

export interface SpikeWalletAPI {
  account: SpikeAccount | null
  isConnected: boolean
  isConnecting: boolean
  lastError: string | null
  openConnectModal: () => void
  disconnect: () => Promise<void>
  signMessage: (message: string) => Promise<SignMessageResult>
}
