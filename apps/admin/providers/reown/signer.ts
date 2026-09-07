/**
 * Concrete dual-chain WalletSigner backed by Reown AppKit. Purely imperative
 * (AppKit modal instance + Wagmi config) — no React hooks — so it can be
 * constructed once and handed to the seam. The wallet-match gating is reactive
 * (SignAction reads `getConnected` via `subscribe`); this only exposes the live
 * connected address, opens the modal, and turns one UnsignedTx into a tx ref.
 *
 * Chain routing:
 *   - Solana (`solana-tx`): deserialize the versioned tx, hand it to the
 *     connected wallet's `signAndSendTransaction` (wallet broadcasts).
 *   - EVM (`evm-tx`): switch the wallet to the exact chain, then Wagmi
 *     `sendTransaction` with an explicit `chainId` (never trust the wallet's
 *     current network). resolveDispute carries no msg.value/approval; on CELO
 *     the admin pays gas in native CELO (the `fee_currency` hint is ignored).
 *   - Sponsored user-ops never target a dispute-authority EOA → hard error.
 */
import { sendTransaction } from '@wagmi/core'
import type { Config } from 'wagmi'
import type { AppKit } from '@reown/appkit/react'
import type { Provider as SolanaProvider } from '@reown/appkit-adapter-solana/react'
import { VersionedTransaction } from '@solana/web3.js'
import { chainNamespaceOf, type UnsignedTx } from '@tenda/shared'
import { UnsupportedChainError, UnsupportedTxError, type WalletSigner } from '@/lib/resolution-sign'
import { buildEvmSendArgs, decodeBase64Tx } from '@/lib/reown-tx'
import { appKitNetworkForChain } from './networks'

// Every namespace whose account changes should re-trigger the reactive read.
const WATCHED_NAMESPACES = ['solana', 'eip155'] as const

async function signSolana(modal: AppKit, unsigned: Extract<UnsignedTx, { kind: 'solana-tx' }>): Promise<string> {
  const provider = modal.getProvider<SolanaProvider>('solana')
  if (provider === undefined) throw new Error('No Solana wallet connected')
  const tx = VersionedTransaction.deserialize(decodeBase64Tx(unsigned.tx_base64))
  return provider.signAndSendTransaction(tx)
}

function signEvm(
  config: Config,
  chainId: string,
  unsigned: Extract<UnsignedTx, { kind: 'evm-tx' }>,
): Promise<string> {
  return sendTransaction(config, buildEvmSendArgs(chainId, unsigned))
}

function namespaceOrThrow(chainId: string): 'solana' | 'eip155' {
  const namespace = chainNamespaceOf(chainId)
  if (namespace === undefined) throw new UnsupportedChainError(chainId)
  return namespace
}

/** Build the seam's WalletSigner from a live AppKit runtime. */
export function createReownSigner(modal: AppKit, config: Config): WalletSigner {
  return {
    getConnected(chainId) {
      return modal.getAddress(namespaceOrThrow(chainId)) ?? null
    },
    subscribe(callback) {
      // Re-read on any account change (address/connect/disconnect across either
      // namespace) and on modal open/close, so the UI reflects a wallet switch.
      const unsubs = [
        ...WATCHED_NAMESPACES.map((ns) => modal.subscribeAccount(() => callback(), ns)),
        modal.subscribeState(() => callback()),
      ]
      return () => {
        for (const unsub of unsubs) unsub()
      }
    },
    async open(chainId) {
      await modal.open({ namespace: namespaceOrThrow(chainId) })
    },
    async signAndBroadcast(chainId, unsigned) {
      if (unsigned.kind === 'evm-userop') throw new UnsupportedTxError(unsigned.kind)
      // Force the wallet onto the escrow's exact network BEFORE signing — for
      // BOTH namespaces — so a resolution is never broadcast on whatever
      // cluster/chain the wallet happened to be left on (e.g. Solana mainnet).
      await modal.switchNetwork(appKitNetworkForChain(chainId))
      return unsigned.kind === 'solana-tx'
        ? signSolana(modal, unsigned)
        : signEvm(config, chainId, unsigned)
    },
  }
}
